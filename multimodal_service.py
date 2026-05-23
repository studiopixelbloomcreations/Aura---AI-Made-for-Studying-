import os
import uuid
from env_utils import env

# Save in the local tmp_media directory in the workspace root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "tmp_media")


def _unique_path(ext: str) -> str:
    os.makedirs(TEMP_DIR, exist_ok=True)
    ext_clean = (ext or "").lstrip(".")
    if not ext_clean:
        ext_clean = "bin"
    return os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}.{ext_clean}")


def save_upload_bytes(data: bytes, ext: str) -> str:
    path = _unique_path(ext)
    with open(path, "wb") as f:
        f.write(data)
    return path


def ocr_image(image_path: str) -> str:
    try:
        import pytesseract
        from PIL import Image
    except Exception as e:
        raise RuntimeError(
            "OCR dependencies not installed. Install with: pip install pytesseract pillow"
        ) from e

    try:
        img = Image.open(image_path)
    except Exception as e:
        raise RuntimeError("Invalid image file") from e

    text = pytesseract.image_to_string(img)
    return (text or "").strip()


def parse_pdf(pdf_path: str) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
        return text.strip()
    except Exception as e:
        return f"[PDF parsing error: {str(e)}]"


def parse_docx(docx_path: str) -> str:
    try:
        import docx
        doc = docx.Document(docx_path)
        return "\n".join([p.text for p in doc.paragraphs]).strip()
    except Exception:
        # Robust standard-library fallback for docx
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(docx_path) as docx_zip:
                xml_content = docx_zip.read('word/document.xml')
            root = ET.fromstring(xml_content)
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for p in root.findall('.//w:p', ns):
                text_runs = []
                for r in p.findall('.//w:t', ns):
                    text_runs.append(r.text or '')
                paragraphs.append(''.join(text_runs))
            return '\n'.join(paragraphs).strip()
        except Exception as e:
            return f"[DOCX parsing error: {str(e)}]"


def parse_txt(txt_path: str) -> str:
    try:
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read().strip()
    except Exception as e:
        return f"[TXT parsing error: {str(e)}]"


def parse_audio(audio_path: str) -> str:
    try:
        from voice_service import speech_to_text
        res = speech_to_text(audio_path)
        return res.text if res else ""
    except Exception as e:
        return f"[Audio transcription error: {str(e)}]"


def parse_file(file_path: str, ext: str) -> str:
    ext_clean = ext.lower().lstrip(".")
    if ext_clean in {"png", "jpg", "jpeg", "bmp", "tiff", "gif"}:
        return ocr_image(file_path)
    elif ext_clean == "pdf":
        return parse_pdf(file_path)
    elif ext_clean in {"docx", "doc"}:
        return parse_docx(file_path)
    elif ext_clean in {"txt", "csv", "json", "md", "xml", "html"}:
        return parse_txt(file_path)
    elif ext_clean in {"wav", "mp3", "m4a", "webm", "ogg", "flac", "aac"}:
        return parse_audio(file_path)
    else:
        return f"[Unsupported file type: .{ext_clean}]"
