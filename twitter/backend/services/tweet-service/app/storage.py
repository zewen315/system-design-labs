import uuid

import boto3
from botocore.client import Config

from app.config import settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}

# generate_presigned_url() signs locally and never opens a connection, so this
# client only needs to be configured with the endpoint the *browser* will
# actually reach (the public gateway address) — that's what gets embedded in
# and signed into the URL, not the internal minio:9000 address.
_client = boto3.client(
    "s3",
    endpoint_url=settings.minio_public_url,
    aws_access_key_id=settings.minio_access_key,
    aws_secret_access_key=settings.minio_secret_key,
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    region_name="us-east-1",
)


def presign_upload(prefix: str, content_type: str) -> tuple[str, str]:
    """Returns (upload_url, public_url) for a new object under the given key prefix."""
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if ext is None:
        raise ValueError(f"Unsupported content type: {content_type}")

    key = f"{prefix}/{uuid.uuid4()}.{ext}"
    upload_url = _client.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.minio_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    public_url = f"{settings.minio_public_url}/media/{key}"
    return upload_url, public_url
