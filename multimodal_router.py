from fastapi import APIRouter, File, UploadFile
from multimodal_service import save_upload_bytes, ocr_image, parse_file

router = APIRouter(prefix="/multimodal", tags=["multimodal"])


@router.post("/upload_image")
async def upload_image(image: UploadFile = File(...)):
    raw = await image.read()
    ext = (image.filename or "image").split(
        ".")[-1] if image.filename and "." in image.filename else "png"
    path = save_upload_bytes(raw, ext)
    text = ocr_image(path)
    return {"ok": True, "text": text}


@router.post("/upload_file")
async def upload_file(file: UploadFile = File(...)):
    raw = await file.read()
    ext = (file.filename or "file").split(
        ".")[-1] if file.filename and "." in file.filename else "bin"
    path = save_upload_bytes(raw, ext)
    text = parse_file(path, ext)
    return {
        "ok": True,
        "filename": file.filename,
        "text": text,
        "path": path
    }
