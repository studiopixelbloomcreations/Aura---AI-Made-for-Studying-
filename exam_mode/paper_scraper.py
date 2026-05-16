from __future__ import annotations

import io
import os
import re
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = "Aevra AI-ExamMode/2.0"
REQUEST_TIMEOUT = 30
MAX_SUBJECT_PAGES = 20
MAX_TERM_PAGES = 30
MAX_PDFS = 40
MAX_PDF_PAGES = 35

DOMAIN_SEED_URLS = [
    "https://pastpapers.wiki/grade-09-term-test-papers-past-papers-short-notes-2/",
    "https://paperswiki.com/grade-09-term-test-papers-past-papers-short-notes-2/",
    "https://www.paperswiki.com/grade-09-term-test-papers-past-papers-short-notes-2/",
]

SUBJECT_ALIASES = {
    "maths": ["maths", "math", "mathematics"],
    "science": ["science"],
    "english": ["english"],
    "sinhala": ["sinhala"],
    "history": ["history"],
    "geography": ["geography"],
    "civics": ["civics", "civic"],
    "ict": ["ict", "information and communication technology"],
    "health": ["health", "physical education"],
}

TERM_ALIASES = {
    "first": ["first", "1st", "term 1", "term1", "1 term"],
    "second": ["second", "2nd", "term 2", "term2", "2 term"],
    "third": ["third", "3rd", "term 3", "term3", "3 term"],
}


class ScrapeError(Exception):
    pass


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return s


def _normalize_term(term: str) -> str:
    t = (term or "").strip().lower()
    if t.startswith("first") or t in {"1", "1st"}:
        return "First Term"
    if t.startswith("second") or t in {"2", "2nd"}:
        return "Second Term"
    if t.startswith("third") or t in {"3", "3rd"}:
        return "Third Term"
    return (term or "").strip().title() or "Third Term"


def _term_key(term: str) -> str:
    t = (term or "").strip().lower()
    if t.startswith("first") or t in {"1", "1st"}:
        return "first"
    if t.startswith("second") or t in {"2", "2nd"}:
        return "second"
    return "third"


def _subject_tokens(subject: str) -> List[str]:
    s = (subject or "").strip().lower()
    if s in SUBJECT_ALIASES:
        return SUBJECT_ALIASES[s]
    for _, aliases in SUBJECT_ALIASES.items():
        if s in aliases:
            return aliases
    return [s] if s else []


def _fetch_soup(sess: requests.Session, url: str) -> BeautifulSoup:
    r = sess.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    if r.status_code != 200:
        raise ScrapeError(f"HTTP {r.status_code} for {url}")
    return BeautifulSoup(r.text, "lxml")


def _extract_year(text: str) -> int:
    m = re.search(r"(20\d{2}|19\d{2})", text or "")
    if not m:
        return 0
    try:
        return int(m.group(1))
    except ValueError:
        return 0


def _is_same_site(url: str) -> bool:
    host = (urlparse(url).netloc or "").lower()
    return any(d in host for d in ["pastpapers.wiki", "paperswiki.com", "www.paperswiki.com"])


def _clean_url(base_url: str, href: str) -> Optional[str]:
    if not href:
        return None
    u = urljoin(base_url, href.strip())
    p = urlparse(u)
    if p.scheme not in {"http", "https"}:
        return None
    if not _is_same_site(u):
        return None
    return u.split("#")[0]


def _has_any(text: str, tokens: List[str]) -> bool:
    t = (text or "").lower()
    return any(tok and tok in t for tok in tokens)


def _score_subject_link(anchor_text: str, href: str, subject_tokens: List[str]) -> int:
    text_blob = f"{anchor_text} {href}".lower()
    score = 0
    if _has_any(text_blob, subject_tokens):
        score += 3
    if "grade-09" in text_blob or "grade 09" in text_blob or "grade 9" in text_blob:
        score += 2
    if "term" in text_blob:
        score += 1
    return score


def _discover_subject_pages(sess: requests.Session, subject: str) -> List[str]:
    subject_tokens = _subject_tokens(subject)
    candidates: List[Tuple[int, str]] = []
    seen: Set[str] = set()

    for seed in DOMAIN_SEED_URLS:
        try:
            soup = _fetch_soup(sess, seed)
        except Exception:
            continue
        for a in soup.select("a[href]"):
            href = _clean_url(seed, a.get("href") or "")
            if not href or href in seen:
                continue
            seen.add(href)
            text = " ".join((a.get_text() or "").split())
            score = _score_subject_link(text, href, subject_tokens)
            if score > 0:
                candidates.append((score, href))

    candidates.sort(key=lambda x: x[0], reverse=True)
    ordered: List[str] = []
    used: Set[str] = set()
    for _, url in candidates:
        if url in used:
            continue
        used.add(url)
        ordered.append(url)
        if len(ordered) >= MAX_SUBJECT_PAGES:
            break
    return ordered


def _extract_pdf_candidates(
    soup: BeautifulSoup, page_url: str, subject_tokens: List[str], term_tokens: List[str]
) -> List[Tuple[int, str]]:
    out: List[Tuple[int, str]] = []
    for a in soup.select("a[href]"):
        href = _clean_url(page_url, a.get("href") or "")
        if not href:
            continue
        low = href.lower()
        if ".pdf" not in low:
            continue
        text = " ".join((a.get_text() or "").split())
        context = f"{text} {href}".lower()
        score = 1
        if _has_any(context, subject_tokens):
            score += 2
        if _has_any(context, term_tokens):
            score += 3
        if "grade-09" in context or "grade 9" in context:
            score += 1
        out.append((score, href))
    return out


def _discover_term_pages(
    sess: requests.Session, subject_pages: List[str], term_tokens: List[str]
) -> List[str]:
    ranked: List[Tuple[int, str]] = []
    seen: Set[str] = set()
    for url in subject_pages:
        try:
            soup = _fetch_soup(sess, url)
        except Exception:
            continue
        ranked.append((4, url))
        for a in soup.select("a[href]"):
            href = _clean_url(url, a.get("href") or "")
            if not href or href in seen:
                continue
            seen.add(href)
            text = " ".join((a.get_text() or "").split()).lower()
            blob = f"{text} {href}".lower()
            score = 0
            if _has_any(blob, term_tokens):
                score += 3
            if "past paper" in blob or "term test" in blob or ".pdf" in blob:
                score += 1
            if score > 0:
                ranked.append((score, href))
    ranked.sort(key=lambda x: x[0], reverse=True)
    out: List[str] = []
    used: Set[str] = set()
    for _, u in ranked:
        if u in used:
            continue
        used.add(u)
        out.append(u)
        if len(out) >= MAX_TERM_PAGES:
            break
    return out


def _download_pdf_bytes(sess: requests.Session, url: str) -> bytes:
    r = sess.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    if r.status_code != 200:
        raise ScrapeError(f"HTTP {r.status_code} for {url}")
    ctype = (r.headers.get("Content-Type") or "").lower()
    if "pdf" not in ctype and ".pdf" not in url.lower():
        raise ScrapeError(f"Not a PDF response for {url}")
    return r.content


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as e:
        raise ScrapeError("pypdf is not available; install requirements") from e

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as e:
        raise ScrapeError("Failed to open PDF") from e

    chunks: List[str] = []
    pages = reader.pages[:MAX_PDF_PAGES]
    for page in pages:
        try:
            txt = page.extract_text() or ""
        except Exception:
            txt = ""
        if txt:
            chunks.append(txt)
    return "\n".join(chunks)


def _looks_like_answer_key(text: str) -> bool:
    t = (text or "").lower()
    return "marking scheme" in t or "answer sheet" in t or "answers only" in t


def _parse_questions_from_text(text: str) -> List[str]:
    lines = []
    for ln in (text or "").splitlines():
        clean = " ".join(ln.strip().split())
        if not clean:
            continue
        if re.match(r"^\s*(page|grade|term test)\b", clean, flags=re.IGNORECASE):
            continue
        lines.append(clean)
    if not lines:
        return []

    joined = "\n".join(lines)
    if _looks_like_answer_key(joined):
        return []

    marker = re.compile(
        r"(?:^|\n)\s*(?:Q(?:uestion)?\s*\d{1,2}|\d{1,2}\s*[\).])\s+",
        flags=re.IGNORECASE,
    )
    parts = marker.split(joined)
    chunks = [c.strip() for c in parts[1:] if c and c.strip()]

    questions: List[str] = []
    for c in chunks:
        c = re.sub(r"\s+", " ", c).strip()
        if len(c) < 25:
            continue
        if len(c) > 750:
            c = c[:750].rsplit(" ", 1)[0] + "..."
        questions.append(c)

    out: List[str] = []
    seen: Set[str] = set()
    for q in questions:
        key = q.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


def scrape_papers_dynamic(subject: str, term: str) -> Dict[int, List[dict]]:
    """
    Scrape Grade 9 papers from paperswiki/pastpapers and extract question text
    from PDFs for the selected subject and exact term.
    """
    sess = _session()
    subject_tokens = _subject_tokens(subject)
    term_key = _term_key(term)
    term_tokens = TERM_ALIASES.get(term_key, TERM_ALIASES["third"])
    term_norm = _normalize_term(term)

    subject_pages = _discover_subject_pages(sess, subject)
    if not subject_pages:
        raise ScrapeError("Could not locate a Grade 9 subject page")

    term_pages = _discover_term_pages(sess, subject_pages, term_tokens)
    if not term_pages:
        raise ScrapeError("Could not locate term pages for the selected subject")

    pdf_ranked: List[Tuple[int, str]] = []
    for page_url in term_pages:
        try:
            soup = _fetch_soup(sess, page_url)
        except Exception:
            continue
        pdf_ranked.extend(_extract_pdf_candidates(soup, page_url, subject_tokens, term_tokens))

    strict = [(s, u) for s, u in pdf_ranked if _has_any(u.lower(), term_tokens)]
    if not strict:
        raise ScrapeError("No exact-term PDF papers found for selected subject")
    ranked_source = strict
    ranked_source.sort(key=lambda x: x[0], reverse=True)

    pdf_urls: List[str] = []
    used: Set[str] = set()
    for _, u in ranked_source:
        if u in used:
            continue
        used.add(u)
        pdf_urls.append(u)
        if len(pdf_urls) >= int(os.environ.get("EXAM_MAX_PDFS", MAX_PDFS)):
            break

    if not pdf_urls:
        raise ScrapeError("No PDF papers found for selected subject and term")

    year_to_questions: Dict[int, List[dict]] = {}
    qid = 1
    for pdf_url in pdf_urls:
        try:
            pdf_bytes = _download_pdf_bytes(sess, pdf_url)
            text = _extract_text_from_pdf(pdf_bytes)
            questions = _parse_questions_from_text(text)
        except Exception:
            continue
        if not questions:
            continue

        year = _extract_year(pdf_url)
        for qt in questions:
            item = {
                "id": f"{year or 'u'}-{qid}",
                "year": year or 0,
                "subject": subject,
                "term": term_norm,
                "text": qt,
                "type": "general",
                "choices": None,
                "answer": None,
                "source_pdf": pdf_url,
            }
            year_to_questions.setdefault(year or 0, []).append(item)
            qid += 1

    if not year_to_questions:
        raise ScrapeError("Failed to extract questions from matched PDF papers")

    return year_to_questions
