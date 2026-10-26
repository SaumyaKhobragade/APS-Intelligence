"""Stable configuration fingerprints, dependency snapshots and artifact checksums."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import platform
import sys
from typing import Any

from importlib.metadata import PackageNotFoundError, version


DEPENDENCY_DISTRIBUTIONS = (
    "fastapi",
    "pydantic",
    "numpy",
    "pandas",
    "scikit-learn",
    "xgboost",
    "catboost",
    "imbalanced-learn",
    "joblib",
)


def _canonical_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _canonical_value(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, (list, tuple)):
        return [_canonical_value(item) for item in value]
    if hasattr(value, "item"):
        return _canonical_value(value.item())
    return value


def canonical_json(value: Any) -> str:
    """Serialize configuration deterministically for hashing and comparison."""

    return json.dumps(_canonical_value(value), sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def configuration_fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def dependency_versions() -> dict[str, str]:
    values = {
        "python": platform.python_version(),
        "platform": platform.platform(),
    }
    for distribution in DEPENDENCY_DISTRIBUTIONS:
        try:
            values[distribution] = version(distribution)
        except PackageNotFoundError:
            values[distribution] = "unavailable"
    return values


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_paths(paths: dict[str, Path]) -> dict[str, str]:
    return {name: sha256_file(path) for name, path in paths.items() if path.is_file()}


def compare_checksums(paths: dict[str, Path], stored: dict[str, str]) -> dict[str, Any]:
    """Return logical artifact integrity details without exposing local paths."""

    items: list[dict[str, Any]] = []
    for name, path in paths.items():
        stored_checksum = stored.get(name)
        if not path.is_file():
            items.append({"logical_name": name, "available": False, "stored_checksum": stored_checksum, "actual_checksum": None, "status": "missing"})
            continue
        actual_checksum = sha256_file(path)
        status = "verified" if stored_checksum and stored_checksum == actual_checksum else "checksum_missing" if not stored_checksum else "mismatch"
        items.append(
            {
                "logical_name": name,
                "available": True,
                "stored_checksum": stored_checksum,
                "actual_checksum": actual_checksum,
                "status": status,
                "size_bytes": path.stat().st_size,
            }
        )
    return {"items": items, "all_available": all(item["available"] for item in items), "all_verified": all(item["status"] == "verified" for item in items)}


def parse_json_object(value: str | None) -> dict[str, Any]:
    try:
        payload = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}
