from __future__ import annotations

import os
import re
from typing import Dict, List, Optional, Any
from urllib.parse import quote_plus

import requests
from groq import Groq

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
    api_key = os.environ.get("GOOGLE_SEARCH_API_KEY", "").strip()
    cx = os.environ.get("GOOGLE_SEARCH_CX", "").strip()
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
    spotify_auth_url = os.environ.get("SPOTIFY_AUTH_URL", "").strip()

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
    if any(g in low for g in ["hi", "hello", "hey tutor", "how are you"]):
        return "Hey, I am Aevra AI. I am here with you. We can chat, plan your day, or handle tasks like directions and music."
    if "homework" in low or "study" in low or "exam" in low:
        return "Absolutely. Tell me the subject and exact question, and I will teach it step by step like a friendly teacher."
    if web_context:
        top = web_context[0]
        return f"I found this: {top.get('title','Result')} - {top.get('snippet','')}"
    return "I am here and listening. Tell me what you want to do, and I will help you right away."


def ask_tutor_personal_agent(
    message: str,
    email: Optional[str],
    language: Optional[str],
    subject: Optional[str],
    title: Optional[str],
    history: Optional[List[Dict[str, str]]] = None,
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
    if action and action.get("type") in {"play_spotify_liked", "connect_spotify", "directions_home", "save_home_address"}:
        should_search = False
    web_context = _google_search_snippets(user_msg, max_results=3) if should_search else []

    hist = history or assistant_memory[email_key][-20:]
    history_text = "\n".join([f"{m.get('role','user')}: {m.get('content','')}" for m in hist[-20:]])

    lang = (language or "English").strip()
    subj = (subject or "General").strip()
    chat_title = (title or "Perosnla IIntelligence").strip()

    system_prompt = (
        "You are Aevra AI, the personal assistant for the Perosnla IIntelligence section. "
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
    if action:
        prompt_parts.append(f"Detected assistant task action: {action}")
    if history_text:
        prompt_parts.append("Recent conversation:\n" + history_text)
    if web_context:
        prompt_parts.append("Google context:\n" + "\n".join([f"- {x['title']}: {x['snippet']} ({x['link']})" for x in web_context]))
    prompt_parts.append("User message:\n" + user_msg)
    user_prompt = "\n\n".join(prompt_parts)

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    # For strong command intents, use deterministic assistant response first.
    if action and action.get("message"):
        answer = str(action.get("message"))
    else:
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
        except Exception as e:
            answer = _fallback_conversation_response(user_msg, action, web_context)

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
    }


def get_personal_assistant_status(email: Optional[str]) -> Dict[str, Any]:
    email_key = _email_key(email)
    state = _ensure_integration_state(email_key)
    return {
        "email": email_key,
        "assistant_name": "Aevra AI",
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


def create_openai_realtime_session(email: Optional[str]) -> Dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {
            "ok": False,
            "error": "OPENAI_API_KEY is missing on backend environment",
        }

    model = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime").strip() or "gpt-realtime"
    voice = os.environ.get("OPENAI_REALTIME_VOICE", "alloy").strip() or "alloy"

    email_key = _email_key(email)
    state = _ensure_integration_state(email_key)
    home = state.get("home_address") or ""

    instructions = (
        "You are Aevra AI, a warm personal assistant. "
        "Keep a natural conversational tone, like a real friendly human assistant. "
        "Help with everyday tasks and study support. "
        "If asked for directions home and home address is known, mention that maps can be opened. "
        f"Known home address: {home if home else 'not set'}."
    )

    payload = {
        "model": model,
        "voice": voice,
        "modalities": ["text", "audio"],
        "instructions": instructions,
    }

    try:
        res = requests.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        data = res.json() if res.content else {}
    except Exception as e:
        return {"ok": False, "error": f"Failed to create realtime session: {str(e)}"}

    if res.status_code >= 400:
        msg = data.get("error", {}).get("message") if isinstance(data, dict) else None
        return {
            "ok": False,
            "error": msg or f"Realtime session failed with HTTP {res.status_code}",
            "status_code": res.status_code,
        }

    client_secret = data.get("client_secret") if isinstance(data, dict) else None
    return {
        "ok": True,
        "model": model,
        "voice": voice,
        "client_secret": client_secret,
        "session": data,
    }
