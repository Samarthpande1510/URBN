import urllib.request
import urllib.error
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from auth import get_current_user
from models import User
import storage

router = APIRouter()

# Spreadsheets are parsed in the browser to render a preview. Fetching the R2
# URL directly would be cross-origin and depends on bucket CORS config, so the
# bytes are proxied through the API (same origin in production) instead.
MAX_PROXY_BYTES = 15 * 1024 * 1024

ALLOWED_FOLDERS = {"products", "npd"}
ALLOWED_TYPES = {
    "image/webp", "image/jpeg", "image/png", "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
    "application/octet-stream",  # browser couldn't detect — allow, name is kept in DB
}


class PresignReq(BaseModel):
    folder: str
    content_type: str


@router.post("/presign")
def presign(data: PresignReq, current_user: User = Depends(get_current_user)):
    if not storage.r2_configured():
        raise HTTPException(status_code=503, detail="File storage is not configured on the server.")
    if data.folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid upload folder.")
    if data.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use JPEG, PNG, WebP or PDF.")
    upload_url, public_url = storage.presign_upload(data.folder, data.content_type)
    return {"upload_url": upload_url, "public_url": public_url}


@router.get("/content")
def content(url: str = Query(...), current_user: User = Depends(get_current_user)):
    """Stream back a file we uploaded, so the browser can read it same-origin.

    Restricted to our own R2 public base — this endpoint must never be usable to
    make the server fetch arbitrary URLs on the caller's behalf.
    """
    base = storage.R2_PUBLIC_BASE
    if not base:
        raise HTTPException(status_code=503, detail="File storage is not configured on the server.")
    if not url.startswith(base.rstrip("/") + "/"):
        raise HTTPException(status_code=400, detail="Only files stored by this app can be fetched.")

    try:
        with urllib.request.urlopen(url, timeout=20) as resp:  # noqa: S310 — prefix-checked above
            declared = resp.headers.get("Content-Length")
            if declared and int(declared) > MAX_PROXY_BYTES:
                raise HTTPException(status_code=413, detail="File is too large to preview.")
            body = resp.read(MAX_PROXY_BYTES + 1)
            if len(body) > MAX_PROXY_BYTES:
                raise HTTPException(status_code=413, detail="File is too large to preview.")
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
    except HTTPException:
        raise
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=404 if e.code == 404 else 502, detail="Could not fetch the file.")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch the file.")

    return Response(content=body, media_type=ctype)
