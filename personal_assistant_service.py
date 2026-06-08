from __future__ import annotations

import re
from typing import Dict, List, Optional, Any
from urllib.parse import quote_plus

import requests
from groq import Groq

from env_utils import env
from user_personalization_router import store as personalization_store


assistant_memory: Dict[str, List[Dict[str, str]]] = {}
assistant_user_facts: Dict[str, Dict[str, str]] = {}
assistant_integrations: Dict[str, Dict[str, Any]] = {}


def _email_key(email: Optional[str]) -> str:
    return (email or "guest@student.com").strip().lower()


def _extract_user_facts(message: str) -> Dict[str, str]:
    text = (message or "").strip()
    out: Dict[str, str] = {}
    patterns = [
        ("name", r"\bmy name is ([A-Za-z][A-Za-z .'-]{1,40})"),
        ("likes", r"\bi like ([A-Za-z0-9 ,.'-]{2,80})"),
        ("goal", r"\bmy goal is to ([A-Za-z0-9 ,.'-]{3,120})"),
        ("preferred_language", r"\bi prefer ([A-Za-z]{3,20})"),
        ("grade", r"\bi am in grade ([0-9]{1,2})"),
    ]
    for key, pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if not m:
            continue
        val = m.group(1).strip().strip(".")
        if key == "grade":
            val = f"Grade {val}"
        out[key] = val
    return out


def _extract_home_address(message: str) -> Optional[str]:
    text = (message or "").strip()
    patterns = [
        r"\bset home (?:to|as) ([A-Za-z0-9 ,./#'\-]{6,180})",
        r"\bmy home is at ([A-Za-z0-9 ,./#'\-]{6,180})",
        r"\bhome address is ([A-Za-z0-9 ,./#'\-]{6,180})",
        r"\bi live at ([A-Za-z0-9 ,./#'\-]{6,180})",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip().rstrip(".")
    return None


def _ensure_integration_state(email_key: str) -> Dict[str, Any]:
    assistant_integrations.setdefault(
        email_key,
        {
            "spotify_connected": False,
            "google_maps_connected": True,
            "home_address": "",
        },
    )
    return assistant_integrations[email_key]


def _google_search_snippets(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    api_key = str(env("GOOGLE_SEARCH_API_KEY", "")).strip()
    cx = str(env("GOOGLE_SEARCH_CX", "")).strip()
    if not api_key or not cx:
        return []

    try:
        r = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={
                "key": api_key,
                "cx": cx,
                "q": query,
                "num": max(1, min(max_results, 10)),
                "safe": "active",
            },
            timeout=12,
        )
        if r.status_code != 200:
            return []
        payload = r.json() or {}
        items = payload.get("items") or []
        out: List[Dict[str, str]] = []
        for it in items[:max_results]:
            out.append(
                {
                    "title": str(it.get("title") or "")[:200],
                    "snippet": str(it.get("snippet") or "")[:600],
                    "link": str(it.get("link") or "")[:300],
                }
            )
        return out
    except Exception:
        return []


def _detect_task_action(user_msg: str, integrations: Dict[str, Any], known_facts: Dict[str, str]) -> Optional[Dict[str, Any]]:
    text = (user_msg or "").strip().lower()
    spotify_auth_url = str(env("SPOTIFY_AUTH_URL", "")).strip()

    # Neural Command System intent classification
    if any(q in text for q in ["test me", "quiz me", "give me a quiz", "exam", "take a test", "start exam"]):
        return {
            "type": "navigate_tab",
            "tab": "exams",
            "message": "I am taking you to the Exam Center right now. Let's test your knowledge and see how prepared you are!",
        }

    if any(q in text for q in ["study dashboard", "view study", "study center", "my plans", "study plan", "flashcards", "view cards", "readiness", "mastery"]):
        return {
            "type": "navigate_tab",
            "tab": "study",
            "message": "Opening your Study Center. Here you can view your readiness metrics, study plans, flashcards, and notes!",
        }

    if "connect spotify" in text or "link spotify" in text:
        return {
            "type": "connect_spotify",
            "requires_connection": True,
            "service": "spotify",
            "oauth_url": spotify_auth_url or None,
            "message": "I can connect Spotify now. Please authorize Spotify to continue.",
        }

    if "play" in text and ("liked playlist" in text or "liked songs" in text or "spotify" in text):
        if not integrations.get("spotify_connected"):
            return {
                "type": "play_spotify_liked",
                "requires_connection": True,
                "service": "spotify",
                "oauth_url": spotify_auth_url or None,
                "message": "I need Spotify connected first. Please connect Spotify.",
            }
        return {
            "type": "play_spotify_liked",
            "requires_connection": False,
            "service": "spotify",
            "message": "Spotify is connected. I am preparing your liked playlist.",
        }

    if "set home" in text or "save home" in text:
        extracted = _extract_home_address(user_msg)
        if extracted:
            return {
                "type": "save_home_address",
                "requires_connection": False,
                "service": "maps",
                "home_address": extracted,
                "message": f"Got it. I saved your home as {extracted}.",
            }
        return {
            "type": "save_home_address",
            "requires_connection": False,
            "service": "maps",
            "message": "Please tell me your home address so I can save it.",
        }

    directions_trigger = (
        ("direction" in text or "directions" in text) and ("home" in text)
    ) or ("get me home" in text) or ("navigate home" in text)
    if directions_trigger:
        home = integrations.get("home_address") or known_facts.get("home_address") or ""
        if not home:
            return {
                "type": "directions_home",
                "requires_connection": False,
                "service": "maps",
                "message": "I need your home address first. Say: set home to <your address>.",
            }
        maps_url = f"https://www.google.com/maps/dir/?api=1&destination={quote_plus(str(home))}&travelmode=driving"
        return {
            "type": "directions_home",
            "requires_connection": False,
            "service": "maps",
            "maps_url": maps_url,
            "message": "Opening Google Maps directions to your home.",
        }

    return None


def _fallback_conversation_response(user_msg: str, action: Optional[Dict[str, Any]], web_context: List[Dict[str, str]]) -> str:
    if action and action.get("message"):
        return str(action.get("message"))

    msg = (user_msg or "").strip()
    low = msg.lower()
    if any(g in low for g in ["hi", "hello", "hey aevra", "how are you"]):
        return "Hey, I am Aura. I am here with you. We can chat, plan your day, or handle tasks like directions and music."
    if "homework" in low or "study" in low or "exam" in low:
        return "Absolutely. Tell me the subject and exact question, and I will teach it step by step like a friendly teacher."
    if web_context:
        top = web_context[0]
        return f"I found this: {top.get('title','Result')} - {top.get('snippet','')}"
    return "I am here and listening. Tell me what you want to do, and I will help you right away."


def orchestrate_model_completion(client: Groq, system_prompt: str, user_prompt: str, user_msg: str, subject: Optional[str]) -> Dict[str, Any]:
    text = (user_msg or "").lower()
    subject_str = (subject or "General").lower()
    
    # Classify complexity and route to models (Agent Harmony)
    is_deep_reasoning = (
        any(x in text for x in ["solve", "equation", "formula", "explain why", "prove", "theory", "calculate", "derivation"]) or
        subject_str in ["math", "maths", "mathematics", "science"]
    )
    is_summary = any(x in text for x in ["summarize", "summary", "flashcards", "study plan", "digest", "notes", "bullet points"])

    # Determine priority list of models based on intent
    models_to_try = []
    reasoning_process = ""
    
    if is_deep_reasoning:
        models_to_try = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768", "llama3-8b-8192", "moonshotai/kimi-k2-instruct-0905"]
        reasoning_process = "Deep logical reasoning required. Routing to Llama 70B model..."
    elif is_summary:
        models_to_try = ["mixtral-8x7b-32768", "llama-3.3-70b-versatile", "llama3-8b-8192", "moonshotai/kimi-k2-instruct-0905"]
        reasoning_process = "Structuring/Summarization task. Routing to Mixtral 8x7B..."
    else:
        models_to_try = ["llama3-8b-8192", "gemma2-9b-it", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct-0905"]
        reasoning_process = "General assistant request. Routing to Llama 8B model..."

    errors = []
    for model_name in models_to_try:
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"[Harmony Orchestrator: {reasoning_process}]\n\n{user_prompt}"},
                ],
                temperature=0.6,
            )
            answer = (response.choices[0].message.content or "").strip()
            confidence = 0.97 if "70b" in model_name else (0.94 if "mixtral" in model_name else 0.89)
            return {
                "answer": answer,
                "model_used": model_name,
                "confidence_score": confidence,
                "orchestration_route": reasoning_process,
            }
        except Exception as e:
            errors.append(f"{model_name}: {str(e)}")
            continue

    # Final fallback to kimi-k2 if Groq fails
    try:
        response = client.chat.completions.create(
            model="moonshotai/kimi-k2-instruct-0905",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
        )
        answer = (response.choices[0].message.content or "").strip()
        return {
            "answer": answer,
            "model_used": "moonshotai/kimi-k2-instruct-0905",
            "confidence_score": 0.85,
            "orchestration_route": "Fallback to kimi-k2 model",
        }
    except Exception as e:
        errors.append(f"kimi-k2: {str(e)}")
        raise RuntimeError(f"All orchestrated models failed. Errors: {', '.join(errors)}")


def ask_aevra_personal_agent(
    message: str,
    email: Optional[str],
    language: Optional[str],
    subject: Optional[str],
    title: Optional[str],
    history: Optional[List[Dict[str, str]]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, object]:
    user_msg = (message or "").strip()
    if not user_msg:
        return {"error": "Message cannot be empty"}

    email_key = _email_key(email)
    assistant_memory.setdefault(email_key, [])
    assistant_user_facts.setdefault(email_key, {})
    integrations = _ensure_integration_state(email_key)

    learned = _extract_user_facts(user_msg)
    if learned:
        assistant_user_facts[email_key].update(learned)
    home_extracted = _extract_home_address(user_msg)
    if home_extracted:
        integrations["home_address"] = home_extracted
        assistant_user_facts[email_key]["home_address"] = home_extracted

    snapshot = personalization_store.get_user_snapshot(email_key)
    profile = snapshot.get("profile") or {}
    progress = snapshot.get("progress") or {}
    feedback = snapshot.get("feedback") or {}

    action = _detect_task_action(user_msg, integrations, assistant_user_facts[email_key])
    should_search = True
    if action and action.get("type") in {"play_spotify_liked", "connect_spotify", "directions_home", "save_home_address", "navigate_tab"}:
        should_search = False
    web_context = _google_search_snippets(user_msg, max_results=3) if should_search else []

    hist = history or assistant_memory[email_key][-20:]
    history_text = "\n".join([f"{m.get('role','user')}: {m.get('content','')}" for m in hist[-20:]])

    lang = (language or "English").strip()
    subj = (subject or "General").strip()
    chat_title = (title or "Perosnla IIntelligence").strip()

    system_prompt = (
        "You are Aura, the personal assistant for the Perosnla IIntelligence section. "
        "Be a warm Siri-like helper and a sweet teacher for homework/study support. "
        "Use the user's stored profile, progress, and preferences when relevant. "
        "If Google context is present, use it carefully and include short source links. "
        "Be helpful, clear, and never invent unknown facts."
    )

    prompt_parts = [
        f"Language: {lang}",
        f"Subject preference: {subj}",
        f"Conversation title: {chat_title}",
        f"User profile: {profile}",
        f"Known facts: {assistant_user_facts[email_key]}",
        f"Integration state: {integrations}",
        f"Progress summary: total_questions={progress.get('total_questions', 0)}, total_correct={progress.get('total_correct', 0)}, total_score={progress.get('total_score', 0)}",
        f"Feedback summary: {feedback}",
    ]

    # Task 5: Inject context into the prompt
    if context:
        prompt_parts.append(
            "Live Study Context:\n"
            f"- Active Tab: {context.get('activeTab', 'chats')}\n"
            f"- Elapsed Time: {context.get('elapsedTime', '0s')}\n"
            f"- Teaching Style: {context.get('teachingStyle', 'socratic')}\n"
            f"- Response Length: {context.get('responseLength', 'balanced')}\n"
            f"- Difficulty Level: {context.get('difficultyLevel', 3)}\n"
            f"- Tone Adjustment: {context.get('toneAdjustment', 'encouraging')}\n"
            f"- Memory Preference: {context.get('memoryPreference', 'deep')}\n"
            f"- Learning Speed: {context.get('learningSpeed', 'normal')}\n"
            f"- User Typing Speed: {context.get('typingSpeed', '45 WPM')}"
        )

    if action:
        prompt_parts.append(f"Detected assistant task action: {action}")
    if history_text:
        prompt_parts.append("Recent conversation:\n" + history_text)
    if web_context:
        prompt_parts.append("Google context:\n" + "\n".join([f"- {x['title']}: {x['snippet']} ({x['link']})" for x in web_context]))
    prompt_parts.append("User message:\n" + user_msg)
    user_prompt = "\n\n".join(prompt_parts)

    client = Groq(api_key=env("GROQ_API_KEY"))
    
    # For strong command intents, use deterministic assistant response first.
    model_used = "deterministic"
    confidence_score = 1.0
    orchestration_route = "Deterministic Rule Engine"
    
    if action and action.get("message"):
        answer = str(action.get("message"))
    else:
        try:
            orchestration_result = orchestrate_model_completion(client, system_prompt, user_prompt, user_msg, subj)
            answer = orchestration_result["answer"]
            model_used = orchestration_result["model_used"]
            confidence_score = orchestration_result["confidence_score"]
            orchestration_route = orchestration_result["orchestration_route"]
        except Exception as e:
            answer = _fallback_conversation_response(user_msg, action, web_context)
            model_used = "local-fallback"
            confidence_score = 0.5
            orchestration_route = f"Error during orchestration: {str(e)}. Falled back to pre-defined responses."

    assistant_memory[email_key].append({"role": "user", "content": user_msg})
    assistant_memory[email_key].append({"role": "assistant", "content": answer})
    assistant_memory[email_key] = assistant_memory[email_key][-60:]

    return {
        "answer": answer,
        "used_google_context": bool(web_context),
        "google_results": web_context,
        "learned_facts": learned,
        "action": action,
        "integration_state": integrations,
        "harmony_metadata": {
            "model_used": model_used,
            "confidence_score": confidence_score,
            "orchestration_route": orchestration_route
        }
    }


def get_personal_assistant_status(email: Optional[str]) -> Dict[str, Any]:
    email_key = _email_key(email)
    state = _ensure_integration_state(email_key)
    return {
        "email": email_key,
        "assistant_name": "Aura",
        "section_name": "Perosnla IIntelligence",
        "integration_state": state,
        "known_facts": assistant_user_facts.get(email_key, {}),
    }


def connect_service(email: Optional[str], service: str) -> Dict[str, Any]:
    email_key = _email_key(email)
    state = _ensure_integration_state(email_key)
    svc = (service or "").strip().lower()
    if svc == "spotify":
        state["spotify_connected"] = True
        return {"ok": True, "service": "spotify", "connected": True}
    if svc in {"maps", "google_maps", "google maps"}:
        state["google_maps_connected"] = True
        return {"ok": True, "service": "google_maps", "connected": True}
    return {"ok": False, "error": "Unsupported service"}


def set_home_address(email: Optional[str], address: str) -> Dict[str, Any]:
    email_key = _email_key(email)
    state = _ensure_integration_state(email_key)
    addr = (address or "").strip()
    if not addr:
        return {"ok": False, "error": "Address is required"}
    state["home_address"] = addr
    assistant_user_facts.setdefault(email_key, {})
    assistant_user_facts[email_key]["home_address"] = addr
    return {"ok": True, "home_address": addr}


# Realtime voice sessions removed — use AURA LIVE (Gemini Native Audio) instead
# See src/aura-live/voice/voice-engine.js for Gemini Live WebSocket implementation
