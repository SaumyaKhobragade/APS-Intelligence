"""Safe filename and storage helpers for future dataset upload endpoints."""

from pathlib import Path
import re

from app.core.exceptions import InvalidRequestError


ALLOWED_DATASET_SUFFIXES = {".csv"}


def sanitize_filename(filename: str) -> str:
    """Return a basename with path traversal and unsafe characters removed."""

    candidate = Path(filename).name
    sanitized = re.sub(r"[^A-Za-z0-9._-]", "_", candidate)
    if sanitized in {"", ".", ".."}:
        raise InvalidRequestError("A safe filename is required.")
    return sanitized


def validate_dataset_filename(filename: str) -> str:
    """Validate and return a sanitized CSV filename."""

    sanitized = sanitize_filename(filename)
    if Path(sanitized).suffix.lower() not in ALLOWED_DATASET_SUFFIXES:
        raise InvalidRequestError("Only CSV dataset files are supported.")
    return sanitized
