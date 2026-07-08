"""Cloudflare R2 (S3-compatible) presigned upload helper."""
import os
import uuid
import boto3
from dotenv import load_dotenv

load_dotenv()

R2_ENDPOINT = os.getenv("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET", "urbn-files")
R2_PUBLIC_BASE = os.getenv("R2_PUBLIC_BASE")  # e.g. https://pub-xxxx.r2.dev

_client = None

EXT_BY_TYPE = {
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
}


def r2_configured() -> bool:
    return bool(R2_ENDPOINT and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE)


def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _client


def presign_upload(folder: str, content_type: str) -> tuple[str, str]:
    """Return (upload_url, public_url) for a browser PUT upload."""
    ext = EXT_BY_TYPE.get(content_type, "")
    key = f"{folder}/{uuid.uuid4().hex}{ext}"
    upload_url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": R2_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=600,
    )
    return upload_url, f"{R2_PUBLIC_BASE}/{key}"
