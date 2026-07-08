from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import User
import storage

router = APIRouter()

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
