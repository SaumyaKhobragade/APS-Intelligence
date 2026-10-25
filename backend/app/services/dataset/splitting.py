"""Leakage-safe reproducible train/validation split preparation."""

from dataclasses import dataclass
from hashlib import sha256

import pandas as pd
from sklearn.model_selection import train_test_split

from app.core.exceptions import InvalidRequestError
from app.schemas.datasets import SplitSummary


@dataclass(frozen=True)
class PreparedSplits:
    training: pd.DataFrame
    validation: pd.DataFrame
    validation_ratio: float
    random_seed: int
    summaries: list[SplitSummary]


def _fingerprint_ids(ids: pd.Index) -> str:
    value = "\n".join(sorted(str(item) for item in ids))
    return sha256(value.encode("utf-8")).hexdigest()


def _summary(name: str, frame: pd.DataFrame, target_column: str, dataset_id: str) -> SplitSummary:
    counts = {str(key): int(value) for key, value in frame[target_column].value_counts().to_dict().items()}
    total = len(frame)
    return SplitSummary(
        split_name=name,  # type: ignore[arg-type]
        record_count=total,
        class_counts=counts,
        class_percentages={key: (value / total * 100 if total else 0.0) for key, value in counts.items()},
        fingerprint=_fingerprint_ids(frame.index),
        source_dataset_id=dataset_id,
    )


def prepare_training_validation_splits(
    frame: pd.DataFrame,
    *,
    target_column: str,
    dataset_id: str,
    validation_ratio: float = 0.2,
    random_seed: int = 42,
) -> PreparedSplits:
    if not 0 < validation_ratio < 0.5:
        raise InvalidRequestError("validation_ratio must be greater than 0 and less than 0.5.")
    if target_column not in frame.columns:
        raise InvalidRequestError(f"Target column '{target_column}' is not available for splitting.")
    if bool(frame[target_column].isna().any()):
        raise InvalidRequestError("The target column cannot contain missing values.")
    training, validation = train_test_split(
        frame,
        test_size=validation_ratio,
        random_state=random_seed,
        stratify=frame[target_column],
        shuffle=True,
    )
    if set(training.index).intersection(validation.index):
        raise InvalidRequestError("Train/validation split overlap detected; split was rejected.")
    summaries = [
        _summary("training", training, target_column, dataset_id),
        _summary("validation", validation, target_column, dataset_id),
    ]
    return PreparedSplits(training, validation, validation_ratio, random_seed, summaries)
