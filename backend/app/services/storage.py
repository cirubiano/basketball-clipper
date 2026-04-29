"""
S3-compatible storage helpers — intentionally synchronous so they work from
both Celery workers (sync) and FastAPI routes (via asyncio.to_thread).

Soporta dos modos:
  - **Desarrollo**: `S3_ENDPOINT_URL=http://minio:9000` apunta a MinIO. Las
    URLs pre-firmadas para el navegador se generan contra `S3_PUBLIC_URL`
    (http://localhost:9000) porque el contenedor MinIO no es resoluble
    desde el navegador.
  - **Producción**: sin `S3_ENDPOINT_URL`, boto3 usa el endpoint regional
    de AWS por defecto. `S3_PUBLIC_URL` también vacío → boto3 firma contra
    AWS S3 y las URLs funcionan desde cualquier cliente.
"""
import logging
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


def _client_kwargs(public_endpoint: bool = False) -> dict[str, Any]:
    """Build boto3 client kwargs, honouring our two-endpoint split."""
    kwargs: dict[str, Any] = {
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.aws_access_key_id or None,
        "aws_secret_access_key": settings.aws_secret_access_key or None,
        # Firma v4 obligatoria para presigned multipart. MinIO la requiere
        # y AWS S3 la acepta sin problemas.
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},  # MinIO prefiere path-style
        ),
    }
    endpoint = settings.s3_public_url if public_endpoint else settings.s3_endpoint_url
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return kwargs


def _client():
    """Cliente boto3 para operaciones internas (backend ↔ S3/MinIO)."""
    return boto3.client("s3", **_client_kwargs(public_endpoint=False))


def _public_client():
    """
    Cliente boto3 que firma URLs contra la URL pública del storage.

    En dev, las presigned URLs tienen que apuntar a `localhost:9000` (lo que
    el navegador ve) y no a `minio:9000` (lo que el backend ve).
    """
    return boto3.client("s3", **_client_kwargs(public_endpoint=True))


# ── Single-shot operations (para clips cortados por FFmpeg, etc.) ────────────

def upload_file(local_path: str, s3_key: str) -> str:
    _client().upload_file(local_path, settings.s3_bucket_name, s3_key)
    logger.debug("upload  s3://%s/%s", settings.s3_bucket_name, s3_key)
    return s3_key


def download_file(s3_key: str, local_path: str) -> None:
    Path(local_path).parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(settings.s3_bucket_name, s3_key, local_path)
    logger.debug("download s3://%s/%s -> %s", settings.s3_bucket_name, s3_key, local_path)


def delete_file(s3_key: str) -> None:
    _client().delete_object(Bucket=settings.s3_bucket_name, Key=s3_key)
    logger.debug("delete   s3://%s/%s", settings.s3_bucket_name, s3_key)


def delete_prefix(prefix: str) -> int:
    """Borra todos los objetos con prefijo *prefix* (ej. "clips/1/42/").

    Útil para limpiar todos los clips de un vídeo en un único barrido.
    Devuelve el número de objetos borrados.
    """
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    deleted_count = 0
    for page in paginator.paginate(Bucket=settings.s3_bucket_name, Prefix=prefix):
        keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if not keys:
            continue
        client.delete_objects(
            Bucket=settings.s3_bucket_name,
            Delete={"Objects": keys, "Quiet": True},
        )
        deleted_count += len(keys)
    logger.info(
        "delete_prefix s3://%s/%s — %d objects removed",
        settings.s3_bucket_name, prefix, deleted_count,
    )
    return deleted_count


def generate_presigned_put_url(
    s3_key: str,
    content_type: str = "image/jpeg",
    expires_in: int = 900,
) -> str:
    """Pre-signed PUT URL para que el navegador suba un objeto directamente a S3/MinIO."""
    return _public_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket_name,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in,
    )


def get_photo_url(s3_key: str) -> str:
    """
    URL para servir una foto de jugador desde el navegador.

    - Dev (MinIO con S3_PUBLIC_URL configurado): el bucket tiene anonymous
      download, así que devolvemos la URL directa sin firma — nunca expira.
    - Prod (S3 sin S3_PUBLIC_URL): devuelve URL pre-firmada con el TTL
      máximo de S3 v4 (7 días). Reemplazar por CloudFront en producción.
    """
    if settings.s3_public_url:
        return f"{settings.s3_public_url}/{settings.s3_bucket_name}/{s3_key}"
    # Prod fallback — máximo TTL permitido por S3 Signature v4: 604 800 s (7 días)
    return get_presigned_url(s3_key, expires_in=604_800)


def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    """Pre-signed GET URL para que el navegador descargue un objeto."""
    try:
        return _public_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket_name, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except ClientError as exc:
        logger.error("get_presigned_url failed for %s: %s", s3_key, exc)
        raise


# ── Multipart upload helpers ─────────────────────────────────────────────────

def create_multipart_upload(s3_key: str, content_type: str = "video/mp4") -> str:
    """
    Inicia un multipart upload en S3/MinIO. Devuelve el ``UploadId`` que
    el cliente debe conservar junto con el s3_key para poder subir partes
    y completar el upload.
    """
    resp = _client().create_multipart_upload(
        Bucket=settings.s3_bucket_name,
        Key=s3_key,
        ContentType=content_type,
    )
    logger.info("multipart init s3://%s/%s (upload_id=%s)",
                settings.s3_bucket_name, s3_key, resp["UploadId"])
    return resp["UploadId"]


def generate_part_url(
    s3_key: str,
    upload_id: str,
    part_number: int,
    expires_in: int = 3600,
) -> str:
    """
    URL pre-firmada para que el navegador suba UNA parte (PUT). ``part_number``
    debe ir de 1 a 10000 según la API de S3.
    """
    return _public_client().generate_presigned_url(
        "upload_part",
        Params={
            "Bucket": settings.s3_bucket_name,
            "Key": s3_key,
            "UploadId": upload_id,
            "PartNumber": part_number,
        },
        ExpiresIn=expires_in,
    )


def list_parts(s3_key: str, upload_id: str) -> list[dict[str, Any]]:
    """
    Lista las partes ya subidas. Se usa para reanudar uploads interrumpidos:
    el cliente mira qué parts ya están en S3 y se salta esas.

    Devuelve [{"PartNumber": int, "ETag": str, "Size": int}, ...].
    """
    parts: list[dict[str, Any]] = []
    paginator = _client().get_paginator("list_parts")
    for page in paginator.paginate(
        Bucket=settings.s3_bucket_name, Key=s3_key, UploadId=upload_id
    ):
        for p in page.get("Parts", []):
            parts.append({
                "PartNumber": p["PartNumber"],
                "ETag": p["ETag"],
                "Size": p["Size"],
            })
    return parts


def complete_multipart_upload(
    s3_key: str,
    upload_id: str,
    parts: list[dict[str, Any]],
) -> None:
    """
    Cierra un multipart upload. ``parts`` debe estar ordenada por ``PartNumber``
    y contener al menos ``{"PartNumber": int, "ETag": str}`` por cada parte.
    """
    sorted_parts = sorted(parts, key=lambda p: p["PartNumber"])
    _client().complete_multipart_upload(
        Bucket=settings.s3_bucket_name,
        Key=s3_key,
        UploadId=upload_id,
        MultipartUpload={
            "Parts": [
                {"PartNumber": p["PartNumber"], "ETag": p["ETag"]}
                for p in sorted_parts
            ]
        },
    )
    logger.info("multipart complete s3://%s/%s (%d parts)",
                settings.s3_bucket_name, s3_key, len(sorted_parts))


def abort_multipart_upload(s3_key: str, upload_id: str) -> None:
    """Aborta un multipart upload, liberando el espacio de las partes subidas."""
    try:
        _client().abort_multipart_upload(
            Bucket=settings.s3_bucket_name,
            Key=s3_key,
            UploadId=upload_id,
        )
        logger.info("multipart abort s3://%s/%s", settings.s3_bucket_name, s3_key)
    except ClientError as exc:
        # Si el upload ya no existe (ya fue completado o abortado), loggear y seguir
        logger.warning("abort_multipart_upload: %s", exc)
