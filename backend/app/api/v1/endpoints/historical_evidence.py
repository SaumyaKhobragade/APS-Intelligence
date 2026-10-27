"""Read-only historical evidence endpoints for persisted ML work."""

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import Settings
from app.schemas.historical_evidence import (
    HistoricalCalibrationResponse,
    HistoricalEvidenceOverview,
    HistoricalRunDetail,
    HistoricalRunListResponse,
    OfficialTestEvidenceResponse,
    HistoricalThresholdResponse,
    HistoricalValidationComparisonResponse,
    HistoricalValidationResponse,
)
from app.services.historical_evidence import HistoricalEvidenceService


router = APIRouter(prefix="/historical-evidence", tags=["historical-evidence"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_service(settings: Settings = Depends(get_settings)) -> HistoricalEvidenceService:
    return HistoricalEvidenceService(settings)


@router.get("/overview", response_model=HistoricalEvidenceOverview, summary="Summarize persisted historical ML evidence")
def historical_overview(service: HistoricalEvidenceService = Depends(get_service)) -> HistoricalEvidenceOverview:
    return service.overview()


@router.get("/training-runs", response_model=HistoricalRunListResponse, summary="List historical Phase 3 training runs")
def historical_training_runs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: HistoricalEvidenceService = Depends(get_service),
) -> HistoricalRunListResponse:
    return service.training_runs(page, page_size)


@router.get("/experiments", response_model=HistoricalRunListResponse, summary="List historical Phase 4 and Phase 9 experiments")
def historical_experiments(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: HistoricalEvidenceService = Depends(get_service),
) -> HistoricalRunListResponse:
    return service.experiments(page, page_size)


@router.get("/experiments/{reference_id}", response_model=HistoricalRunDetail, summary="Get one historical experiment")
def historical_experiment_detail(reference_id: str, service: HistoricalEvidenceService = Depends(get_service)) -> HistoricalRunDetail:
    return service.experiment_detail(reference_id)


@router.get("/validation/comparison", response_model=HistoricalValidationComparisonResponse, summary="Compare persisted historical validation evidence")
def historical_validation_comparison(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: HistoricalEvidenceService = Depends(get_service),
) -> HistoricalValidationComparisonResponse:
    return service.validation_comparison(page, page_size)


@router.get("/validation/{reference_id}", response_model=HistoricalValidationResponse, summary="Get one historical validation evidence record")
def historical_validation(reference_id: str, service: HistoricalEvidenceService = Depends(get_service)) -> HistoricalValidationResponse:
    return service.validation_detail(reference_id)


@router.get("/thresholds/{reference_id}", response_model=HistoricalThresholdResponse, summary="Get persisted historical threshold evidence")
def historical_thresholds(reference_id: str, service: HistoricalEvidenceService = Depends(get_service)) -> HistoricalThresholdResponse:
    return service.thresholds(reference_id)


@router.get("/calibration/{reference_id}", response_model=HistoricalCalibrationResponse, summary="Get persisted historical calibration evidence")
def historical_calibration(reference_id: str, service: HistoricalEvidenceService = Depends(get_service)) -> HistoricalCalibrationResponse:
    return service.calibration(reference_id)


@router.get("/official-test", response_model=OfficialTestEvidenceResponse, summary="Get persisted Phase 10 official-test evidence")
def official_test_evidence(service: HistoricalEvidenceService = Depends(get_service)) -> OfficialTestEvidenceResponse:
    return service.official_test()
