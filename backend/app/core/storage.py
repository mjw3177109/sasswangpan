from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.config import Config
from fastapi import HTTPException

from app.core.config import settings


@lru_cache(maxsize=1)
def s3_client():
    if not settings.storage_is_remote:
        raise RuntimeError("remote object storage is not enabled")
    missing = [
        name
        for name, value in {
            "STORAGE_BUCKET": settings.storage_bucket,
            "STORAGE_ENDPOINT_URL": settings.storage_endpoint_url,
            "STORAGE_ACCESS_KEY_ID": settings.storage_access_key_id,
            "STORAGE_SECRET_ACCESS_KEY": settings.storage_secret_access_key,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"missing object-storage configuration: {', '.join(missing)}")
    return boto3.client(
        "s3",
        endpoint_url=settings.storage_endpoint_url,
        aws_access_key_id=settings.storage_access_key_id,
        aws_secret_access_key=settings.storage_secret_access_key,
        region_name=settings.storage_region,
        config=Config(signature_version="s3v4"),
    )


def create_upload_url(storage_key: str, mime_type: str) -> str:
    try:
        return s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.storage_bucket,
                "Key": storage_key,
                "ContentType": mime_type,
            },
            ExpiresIn=settings.storage_presign_ttl_seconds,
        )
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "STORAGE_UNAVAILABLE", "message": "对象存储暂时不可用"},
        ) from exc


def create_download_url(storage_key: str, file_name: str, mime_type: str) -> str:
    disposition = f"inline; filename*=UTF-8''{quote(file_name)}"
    try:
        return s3_client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.storage_bucket,
                "Key": storage_key,
                "ResponseContentType": mime_type,
                "ResponseContentDisposition": disposition,
            },
            ExpiresIn=settings.storage_presign_ttl_seconds,
        )
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "STORAGE_UNAVAILABLE", "message": "对象存储暂时不可用"},
        ) from exc


def object_size(storage_key: str) -> int:
    try:
        response = s3_client().head_object(Bucket=settings.storage_bucket, Key=storage_key)
        return int(response.get("ContentLength", 0))
    except Exception as exc:
        raise HTTPException(
            400,
            {"code": "UPLOAD_NOT_FOUND", "message": "未找到已上传文件，请重新上传"},
        ) from exc


def remove_object(storage_key: str) -> None:
    try:
        s3_client().delete_object(Bucket=settings.storage_bucket, Key=storage_key)
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "STORAGE_DELETE_FAILED", "message": "对象存储删除失败，请稍后重试"},
        ) from exc
