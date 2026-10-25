"""Safe APS CSV ingestion and schema validation."""

from dataclasses import dataclass
import csv
from hashlib import sha256
from pathlib import Path
import re
from typing import Literal

import pandas as pd
from pandas.errors import EmptyDataError, ParserError

from app.core.exceptions import InvalidRequestError


DatasetKind = Literal["training", "testing", "custom"]
MISSING_TOKENS = ["na", "NA", "NaN", "nan", "?", ""]
_SAFE_DATASET_FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$", re.IGNORECASE)


class DatasetValidationError(InvalidRequestError):
    """Raised when a CSV cannot satisfy the APS dataset contract."""

    error_code = "dataset_validation_error"


@dataclass(frozen=True)
class DatasetFileInfo:
    path: Path
    dataset_type: DatasetKind
    dataset_name: str
    source_file_name: str
    fingerprint: str
    file_size_bytes: int
    header_line_number: int


@dataclass(frozen=True)
class IngestedDataset:
    info: DatasetFileInfo
    frame: pd.DataFrame
    target_column: str
    feature_columns: list[str]
    invalid_value_counts: dict[str, int]


def validate_dataset_filename(filename: str) -> str:
    """Allow only a simple CSV basename for uploaded dataset files."""

    candidate = Path(filename).name
    if candidate != filename or not _SAFE_DATASET_FILENAME.fullmatch(candidate):
        raise DatasetValidationError("Uploaded dataset filenames must be simple .csv basenames.")
    return candidate


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def find_header_line(path: Path, target_column: str = "class", max_lines: int = 200) -> int:
    """Find the CSV header after the APS license preamble."""

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle):
            fields = [field.strip() for field in line.rstrip("\r\n").split(",")]
            if fields and fields[0] == target_column:
                return line_number
            if line_number >= max_lines:
                break
    raise DatasetValidationError(f"Could not find a CSV header beginning with '{target_column}' in {path.name}.")


def _header_columns(path: Path, header_line: int) -> list[str]:
    """Read the original header so pandas cannot hide duplicate names by mangling them."""

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle):
            if line_number == header_line:
                return [field.strip() for field in next(csv.reader([line]))]
    raise DatasetValidationError(f"Could not read the CSV header from {path.name}.")


def validate_columns(columns: list[str], *, target_column: str, expected_feature_count: int | None = None) -> list[str]:
    if not columns:
        raise DatasetValidationError("The dataset has no columns.")
    duplicates = pd.Index(columns)[pd.Index(columns).duplicated()].unique().tolist()
    if duplicates:
        raise DatasetValidationError(f"Duplicate column names detected: {duplicates}.")
    if target_column not in columns:
        raise DatasetValidationError(f"Required target column '{target_column}' is missing.")
    feature_columns = [column for column in columns if column != target_column]
    if not feature_columns:
        raise DatasetValidationError("The dataset must contain at least one feature column.")
    if expected_feature_count is not None and len(feature_columns) != expected_feature_count:
        raise DatasetValidationError(
            f"Expected {expected_feature_count} feature columns, found {len(feature_columns)}."
        )
    return feature_columns


def read_dataset(
    path: Path,
    *,
    dataset_type: DatasetKind,
    target_column: str = "class",
    expected_feature_count: int | None = None,
) -> IngestedDataset:
    """Read a CSV without modifying it and validate its tabular contract."""

    if not path.exists() or not path.is_file():
        raise DatasetValidationError(f"Dataset file does not exist: {path.name}.")
    header_line = find_header_line(path, target_column=target_column)
    validate_columns(_header_columns(path, header_line), target_column=target_column, expected_feature_count=expected_feature_count)
    try:
        frame = pd.read_csv(
            path,
            skiprows=header_line,
            na_values=MISSING_TOKENS,
            keep_default_na=True,
            on_bad_lines="error",
            low_memory=False,
        )
    except (EmptyDataError, ParserError, UnicodeDecodeError, ValueError) as exc:
        raise DatasetValidationError(f"Could not parse {path.name}: {exc}") from exc
    columns = [str(column) for column in frame.columns]
    feature_columns = validate_columns(columns, target_column=target_column, expected_feature_count=expected_feature_count)
    if frame.empty:
        raise DatasetValidationError(f"Dataset {path.name} contains no records.")

    invalid_value_counts: dict[str, int] = {}
    for feature_name in feature_columns:
        numeric = pd.to_numeric(frame[feature_name], errors="coerce")
        invalid_count = int((pd.notna(frame[feature_name]) & pd.isna(numeric)).sum())
        if invalid_count:
            invalid_value_counts[feature_name] = invalid_count
        frame[feature_name] = numeric

    target_values = frame[target_column].astype("string").str.strip()
    unexpected_labels = sorted(set(target_values.dropna().unique()) - {"neg", "pos"})
    if unexpected_labels:
        raise DatasetValidationError(f"Unexpected target labels in {target_column}: {unexpected_labels}.")
    if bool(pd.isna(target_values).any()):
        raise DatasetValidationError(f"Target column '{target_column}' contains missing labels.")
    if invalid_value_counts:
        details = ", ".join(f"{name}={count}" for name, count in invalid_value_counts.items())
        raise DatasetValidationError(f"Non-numeric feature values detected; no records were discarded: {details}.")

    info = DatasetFileInfo(
        path=path,
        dataset_type=dataset_type,
        dataset_name=path.stem,
        source_file_name=path.name,
        fingerprint=sha256_file(path),
        file_size_bytes=path.stat().st_size,
        header_line_number=header_line + 1,
    )
    frame[target_column] = target_values
    return IngestedDataset(info, frame, target_column, feature_columns, invalid_value_counts)


def validate_compatible_schemas(training: IngestedDataset, testing: IngestedDataset) -> None:
    """Ensure official training and test files expose the same feature schema."""

    if training.feature_columns != testing.feature_columns:
        training_only = [column for column in training.feature_columns if column not in testing.feature_columns]
        testing_only = [column for column in testing.feature_columns if column not in training.feature_columns]
        raise DatasetValidationError(
            f"Training/test feature schemas differ. Training-only={training_only}; test-only={testing_only}."
        )
    if training.target_column != testing.target_column:
        raise DatasetValidationError("Training and official test target columns differ.")
