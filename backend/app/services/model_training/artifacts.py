"""Filesystem persistence for model and preprocessing artifacts."""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

import joblib


@dataclass(frozen=True)
class TrainingArtifactPaths:
    """Stable artifact locations for one training run."""

    directory: Path
    model: Path
    preprocessor: Path
    metadata: Path
    split_metadata: Path


def training_artifact_paths(root: Path, run_id: str) -> TrainingArtifactPaths:
    directory = root / "training" / run_id
    return TrainingArtifactPaths(
        directory=directory,
        model=directory / "model.joblib",
        preprocessor=directory / "preprocessor.joblib",
        metadata=directory / "metadata.json",
        split_metadata=directory / "splits.json",
    )


def save_joblib(value: Any, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(value, path)
    return path


def load_joblib(path: Path) -> Any:
    return joblib.load(path)


def save_json(value: Any, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=str), encoding="utf-8")
    return path


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
