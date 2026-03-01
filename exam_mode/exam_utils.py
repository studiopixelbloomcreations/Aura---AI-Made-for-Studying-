import random
import re
import os
from typing import Dict, List, Tuple

# Helper utilities for Exam Mode.
# scrape_papers() now attempts real scraping via paperswiki.com with caching (lazy imports),
# and falls back to a synthetic generator if scraping fails.

SUBJECT_TYPE_MAP = {
    "Maths": ["algebra", "geometry", "number_theory", "probability"],
    "Science": ["physics", "chemistry", "biology"],
    "English": ["grammar", "comprehension", "essay"],
}

TERMS = {"First term", "Second term", "Third term"}


def normalize_term(term: str) -> str:
    t = (term or "").strip().lower()
    if t.startswith("first"): return "First term"
    if t.startswith("second"): return "Second term"
    if t.startswith("third"): return "Third term"
    return term


def scrape_papers(subject: str, term: str) -> Dict[int, List[Dict]]:
    """
    Try dynamic scrape from paperswiki.com with caching.
    On failure (including missing libs), fall back to synthetic generation.
    Returns: {year: [{id, year, subject, term, text, type, choices, answer}, ...]}
    """
    # Lazy import to avoid hard dependency unless used
    try:
        from .paper_cache import cache, cache_key  # type: ignore
        from .paper_scraper import scrape_papers_dynamic  # type: ignore
    except Exception:
        cache = None
        cache_key = None
        scrape_papers_dynamic = None  # type: ignore

    allow_fallback = os.environ.get("EXAM_ALLOW_SYNTHETIC_FALLBACK", "").strip().lower() in {
        "1", "true", "yes", "on"
    }

    # Attempt cache first
    if cache and cache_key:
        ck = cache_key(subject, term)
        cached = cache.get(ck)
        if cached:
            return cached

    # Try dynamic scrape
    if scrape_papers_dynamic:
        try:
            data = scrape_papers_dynamic(subject, term)
            if cache and cache_key:
                cache.set(cache_key(subject, term), data, ttl_seconds=6 * 3600)
            return data
        except Exception:
            if not allow_fallback:
                raise
    else:
        if not allow_fallback:
            raise RuntimeError("Real paper scraper dependencies are unavailable (install bs4/lxml/requests/pypdf)")

    # Fallback: synthetic generation
    term_norm = normalize_term(term)
    topics = SUBJECT_TYPE_MAP.get(subject, ["general"])
    years = [2019, 2020, 2023]
    data: Dict[int, List[Dict]] = {}
    qid = 1
    for y in years:
        questions = []
        for idx, tp in enumerate(topics):
            is_mcq = (idx % 2 == 0)
            if is_mcq:
                a, b = random.randint(1, 9), random.randint(1, 9)
                correct = str(a + b)
                opts = [correct, str(a + b + 1), str(a + b - 1), str(a + b + 2)]
                random.shuffle(opts)
                text = f"[{tp.upper()}] What is {a} + {b}?"
                q = {
                    "id": f"{y}-{qid}",
                    "year": y,
                    "subject": subject,
                    "term": term_norm,
                    "text": text,
                    "type": tp,
                    "choices": opts,
                    "answer": correct,
                }
            else:
                a, b = random.randint(2, 12), random.randint(2, 12)
                correct = str(a * b)
                text = f"[{tp.upper()}] Compute {a} x {b}"
                q = {
                    "id": f"{y}-{qid}",
                    "year": y,
                    "subject": subject,
                    "term": term_norm,
                    "text": text,
                    "type": tp,
                    "choices": None,
                    "answer": correct,
                }
            questions.append(q)
            qid += 1
        data[y] = questions

    if cache and cache_key:
        cache.set(cache_key(subject, term), data, ttl_seconds=30 * 60)
    return data


def random_question_from_papers(papers: Dict[int, List[Dict]]) -> Dict:
    years = list(papers.keys())
    if not years:
        raise ValueError("No papers loaded")
    y = random.choice(years)
    q = random.choice(papers[y])
    return q


def is_correct(user_answer: str, correct_answer: str) -> bool:
    if correct_answer is None:
        return False
    ua = str(user_answer).strip().lower()
    ca = str(correct_answer).strip().lower()
    # Allow numeric equivalence
    try:
        return float(re.sub(r"[^0-9.\-]", "", ua)) == float(re.sub(r"[^0-9.\-]", "", ca))
    except Exception:
        return ua == ca


def mastery_teaching_steps(q_type: str) -> List[Tuple[str, str]]:
    if q_type == "algebra":
        return [
            ("Identify variables", "Recognize knowns and unknowns in the expression."),
            ("Isolate target", "Use inverse operations to isolate the variable."),
            ("Check solution", "Substitute back to verify the equality holds."),
        ]
    if q_type == "geometry":
        return [
            ("Draw a diagram", "Sketch and label given information."),
            ("Apply theorems", "Use angle/triangle properties appropriately."),
            ("Compute", "Plug values and solve for the unknown."),
        ]
    return [
        ("Understand the problem", "Restate what is being asked in your own words."),
        ("Plan", "Choose a strategy: formula, pattern, or logical steps."),
        ("Execute", "Carry out the steps carefully and show working."),
        ("Review", "Verify result makes sense and units/format are correct."),
    ]


def badge_for_type(q_type: str) -> str:
    return f"{q_type.replace('_', ' ').title()} Master"
