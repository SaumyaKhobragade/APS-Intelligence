"""Dataset ingestion, profiling, quality and preprocessing endpoints."""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, PayloadTooLargeError
from app.database.session import get_db
from app.schemas.datasets import (
    ClassDistributionResponse,
    DataQualityResponse,
    DatasetImportResponse,
    DatasetKind,
    DatasetListResponse,
    DatasetProfileResponse,
    DatasetSummary,
    FeatureDetailResponse,
    FeaturePageResponse,
    MissingValuesResponse,
    PreprocessingRequest,
    PreprocessingRunResponse,
    PreprocessingStatusResponse,
    SplitsResponse,
)
from app.services.dataset.ingestion import validate_dataset_filename
from app.services.dataset.service import DatasetService


router = APIRouter(prefix="/datasets", tags=["datasets"])


def get_settings(request: Request) -> Settings:
    """Resolve settings through the request dependency graph."""

    return request.app.state.settings


def get_dataset_service(settings: Settings = Depends(get_settings), session: Session = Depends(get_db)) -> DatasetService:
    return DatasetService(settings, session)


@router.get("", response_model=DatasetListResponse, summary="List registered datasets")
def list_datasets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    dataset_type: DatasetKind | None = Query(default=None),
    service: DatasetService = Depends(get_dataset_service),
) -> DatasetListResponse:
    items, total = service.list_datasets(page, page_size, dataset_type)
    return DatasetListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{dataset_id}", response_model=DatasetSummary, summary="Get dataset metadata")
def get_dataset(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> DatasetSummary:
    return service._summary(service.get_metadata(dataset_id))


@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse, summary="Profile a dataset")
def profile_dataset(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> DatasetProfileResponse:
    return service.profile(dataset_id)


@router.get("/{dataset_id}/quality", response_model=DataQualityResponse, summary="Get data-quality report")
def dataset_quality(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> DataQualityResponse:
    return service.profile(dataset_id).quality


@router.get("/{dataset_id}/features", response_model=FeaturePageResponse, summary="List feature statistics")
def dataset_features(
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=100),
    service: DatasetService = Depends(get_dataset_service),
) -> FeaturePageResponse:
    return service.features(dataset_id, page, page_size, search)


@router.get("/{dataset_id}/features/{feature_name}", response_model=FeatureDetailResponse, summary="Inspect one feature")
def dataset_feature(dataset_id: str, feature_name: str, service: DatasetService = Depends(get_dataset_service)) -> FeatureDetailResponse:
    return service.feature(dataset_id, feature_name)


@router.get("/{dataset_id}/missing-values", response_model=MissingValuesResponse, summary="Get missing-value analysis")
def dataset_missing_values(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> MissingValuesResponse:
    return service.profile(dataset_id).missing_values


@router.get("/{dataset_id}/class-distribution", response_model=ClassDistributionResponse, summary="Get target class distribution")
def dataset_class_distribution(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> ClassDistributionResponse:
    return service.profile(dataset_id).class_distribution


@router.post("/import", response_model=DatasetImportResponse, status_code=status.HTTP_201_CREATED, summary="Import a custom CSV")
async def import_dataset(
    file: UploadFile = File(...),
    dataset_type: DatasetKind = Query(default="custom"),
    service: DatasetService = Depends(get_dataset_service),
) -> DatasetImportResponse:
    if dataset_type != "custom":
        raise InvalidRequestError("The import endpoint accepts custom datasets only; configured APS files are immutable.")
    safe_name = validate_dataset_filename(file.filename or "")
    destination = service.settings.raw_dataset_dir / f"import-{uuid4().hex[:12]}-{Path(safe_name).name}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    max_bytes = service.settings.max_dataset_upload_bytes
    total_bytes = 0

    try:
        with destination.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    handle.close()
                    destination.unlink(missing_ok=True)
                    raise PayloadTooLargeError(
                        f"Uploaded dataset file exceeds the maximum allowed size of {max_bytes} bytes (50 MiB)."
                    )
                handle.write(chunk)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

    summary = service.register_file(destination, "custom", dataset_name=Path(safe_name).stem)
    return DatasetImportResponse(dataset=summary, message="CSV imported without modifying configured APS reference files.")


@router.post("/{dataset_id}/preprocess", response_model=PreprocessingRunResponse, status_code=status.HTTP_201_CREATED, summary="Prepare reproducible preprocessing artifacts")
def preprocess_dataset(dataset_id: str, request: PreprocessingRequest, service: DatasetService = Depends(get_dataset_service)) -> PreprocessingRunResponse:
    return service.preprocess(dataset_id, request)


@router.get("/{dataset_id}/splits", response_model=SplitsResponse, summary="Get prepared train and validation splits")
def dataset_splits(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> SplitsResponse:
    return service.splits(dataset_id)


@router.get("/{dataset_id}/preprocessing-status", response_model=PreprocessingStatusResponse, summary="Get preprocessing runs")
def preprocessing_status(dataset_id: str, service: DatasetService = Depends(get_dataset_service)) -> PreprocessingStatusResponse:
    return service.preprocessing_status(dataset_id)
