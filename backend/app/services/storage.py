"""
S3 storage helpers — intentionally synchronous so they work from both
Celery workers (sync) and FastAPI routes (via asyncio.to_thread).
"""
import logging
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


def _client():
    """Creates a fresh boto3 S3 client.

    Passing None for credentials makes boto3 fall through to the standard
    credential chain (env vars → ~/.aws → EC2/ECS IAM role), which is
    correct for both local dev (credentials in .env) and production (IAM role).
    """
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )


def upload_file(local_path: str, s3_key: str) -> str:
    """Uploads *local_path* to S3 and returns the s3_key."""
    _client().upload_file(local_path, settings.s3_bucket_name, s3_key)
    logger.debug("upload  s3://%s/%s", settings.s3_bucket_name, s3_key)
    return s3_key


def download_file(s3_key: str, local_path: str) -> None:
    """Downloads an S3 object to *local_path*, creating parent dirs as needed."""
    Path(local_path).parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(settings.s3_bucket_name, s3_key, local_path)
    logger.debug("download s3://%s/%s → %s", settings.s3_bucket_name, s3_key, local_path)


def delete_file(s3_key: str) -> None:
    """Deletes an object from the bucket. No-ops if the key does not exist."""
    _client().delete_object(Bucket=settings.s3_bucket_name, Key=s3_key)
    logger.debug("delete   s3://%s/%s", settings.s3_bucket_name, s3_key)


def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    """Returns a pre-signed GET URL for *s3_key*, valid for *expires_in* seconds."""
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket_name, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except ClientError as exc:
        logger.error("get_presigned_url failed for %s: %s", s3_key, exc)
        raise
