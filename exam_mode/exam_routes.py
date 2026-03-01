from fastapi import APIRouter, HTTPException
from typing import Dict

from .exam_models import (
    StartExamRequest, StartExamResponse,
    FetchPapersRequest, FetchPapersResponse,
    AskQuestionRequest, AskQuestionResponse,
    EvaluateRequest, EvaluateResponse,
)
from .exam_service import exam_service

router = APIRouter(prefix="/exam-mode", tags=["Exam Mode"])


@router.post("/start", response_model=StartExamResponse)
def start_exam(req: StartExamRequest):
    state = exam_service.start_session(mode=req.mode, term=req.term, subject=req.subject, session_id=req.session_id)
    return StartExamResponse(session_id=state.session_id, message="Exam Mode initialized. Proceed to fetch papers.")


@router.post("/fetch-papers", response_model=FetchPapersResponse)
def fetch_papers(req: FetchPapersRequest):
    try:
        papers = exam_service.fetch_papers(req.session_id, subject=req.subject, term=req.term)
    except KeyError:
        raise HTTPException(status_code=404, detail="Invalid session")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Paper fetch failed: {str(e)}")

    counts: Dict[int, int] = {y: len(qs) for y, qs in papers.items()}
    total = sum(counts.values())
    return FetchPapersResponse(session_id=req.session_id, papers=counts, total_questions=total, message="Papers loaded.")


@router.post("/ask-question", response_model=AskQuestionResponse)
def ask_question(req: AskQuestionRequest):
    try:
        q = exam_service.next_question(req.session_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    progress = exam_service.progress_snapshot(req.session_id)
    return AskQuestionResponse(session_id=req.session_id, question=q, progress=progress)


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest):
    try:
        result = exam_service.evaluate(req.session_id, req.question_id, req.user_answer)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return EvaluateResponse(session_id=req.session_id, **result)
