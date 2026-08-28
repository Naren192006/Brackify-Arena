"""Storage boundary for signed uploads and future provider implementations."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UploadTarget:
    bucket: str
    path: str
    content_type: str


class StorageService(Protocol):
    async def create_upload_target(self, target: UploadTarget) -> str:
        ...

    async def create_read_url(self, bucket: str, path: str) -> str:
        ...
