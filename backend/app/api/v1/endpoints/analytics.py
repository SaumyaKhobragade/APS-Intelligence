"""Phase 8 consolidated analytics and bounded export endpoints."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError
from app.database.session import get_db
from app.models.prediction import PredictionRecord
from app.schemas.analytics import (
    DashboardResponse,
    DatasetAnalyticsResponse,
    ModelComparisonResponse,
    ThresholdAnalyticsListResponse,
    ThresholdAnalyticsResponse,
)
from app.schemas.registry import RegistryReferenceType
from app.services.analytics import AnalyticsService
from app.services.historical_evidence import HistoricalEvidenceService
from app.services.registry import ModelRegistryService
from app.services.reports import ReportService, safe_component


router = APIRouter(tags=["analytics"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_analytics_service(
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(settings, session)


def get_report_service(
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db),
) -> ReportService:
    return ReportService(
        AnalyticsService(settings, session),
        ModelRegistryService(settings, session),
        HistoricalEvidenceService(settings),
    )


@router.get("/analytics/dashboard", response_model=DashboardResponse, summary="Get consolidated dashboard analytics")
def dashboard(service: AnalyticsService = Depends(get_analytics_service)) -> DashboardResponse:
    return service.dashboard()


@router.get("/analytics/datasets/{dataset_id}", response_model=DatasetAnalyticsResponse, summary="Get persisted dataset analytics")
def dataset_analytics(
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
    service: AnalyticsService = Depends(get_analytics_service),
) -> DatasetAnalyticsResponse:
    return service.dataset(dataset_id, page, page_size)


@router.get("/analytics/models/comparison", response_model=ModelComparisonResponse, summary="Get chart-ready model comparison analytics")
def model_comparison(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_name: str | None = Query(default=None, min_length=1, max_length=64),
    experiment_id: str | None = Query(default=None, min_length=1, max_length=80),
    imbalance_strategy: str | None = Query(default=None, min_length=1, max_length=32),
    evaluation_type: Literal["validation", "official_test", "production"] = Query(default="validation"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    service: AnalyticsService = Depends(get_analytics_service),
) -> ModelComparisonResponse:
    return service.model_comparison(
        page,
        page_size,
        model_name=model_name,
        experiment_id=experiment_id,
        imbalance_strategy=imbalance_strategy,
        evaluation_type=evaluation_type,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/analytics/thresholds", response_model=ThresholdAnalyticsListResponse, summary="List available threshold and calibration analytics")
def threshold_analytics_list(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: AnalyticsService = Depends(get_analytics_service),
) -> ThresholdAnalyticsListResponse:
    return service.threshold_list(page, page_size)


@router.get("/analytics/thresholds/{reference_id}", response_model=ThresholdAnalyticsResponse, summary="Get consolidated threshold and calibration analytics")
def threshold_analytics(
    reference_id: str,
    service: AnalyticsService = Depends(get_analytics_service),
) -> ThresholdAnalyticsResponse:
    return service.threshold(reference_id)


@router.get("/exports/experiments/{reference_type}/{reference_id}.json", summary="Export experiment evidence as JSON")
def export_experiment_json(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ReportService = Depends(get_report_service),
) -> StreamingResponse:
    safe_id = safe_component(reference_id)
    return _download(service.experiment_json(reference_type, reference_id), "application/json", f"{safe_id}-experiment.json")


@router.get("/exports/experiments/{reference_type}/{reference_id}.csv", summary="Export experiment validation results as CSV")
def export_experiment_csv(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ReportService = Depends(get_report_service),
) -> StreamingResponse:
    safe_id = safe_component(reference_id)
    return _download(service.experiment_csv(reference_type, reference_id), "text/csv; charset=utf-8", f"{safe_id}-experiment.csv")


@router.get("/reports/experiments/{reference_type}/{reference_id}.pdf", summary="Generate a reusable experiment evidence PDF")
def export_experiment_pdf(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ReportService = Depends(get_report_service),
) -> StreamingResponse:
    safe_id = safe_component(reference_id)
    return _download(service.experiment_pdf(reference_type, reference_id), "application/pdf", f"{safe_id}-experiment-report.pdf")


@router.get("/exports/models/comparison.csv", summary="Export model comparison analytics as CSV")
def export_model_comparison_csv(
    model_name: str | None = Query(default=None, min_length=1, max_length=64),
    evaluation_type: Literal["validation", "official_test", "production"] = Query(default="validation"),
    service: AnalyticsService = Depends(get_analytics_service),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    comparison = service.model_comparison(1, settings.analytics_export_max_rows, model_name=model_name, evaluation_type=evaluation_type)
    report = ReportService(service, ModelRegistryService(settings, service.session))
    return _download(report.comparison_csv(comparison), "text/csv; charset=utf-8", "aps-model-comparison.csv")


@router.get("/exports/predictions.csv", summary="Export bounded prediction history as CSV")
def export_predictions_csv(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    model_reference_id: str | None = Query(default=None, min_length=1, max_length=80),
    predicted_class: Literal["pos", "neg"] | None = Query(default=None),
    page_size: int = Query(default=1000, ge=1, le=5000),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db),
) -> StreamingResponse:
    if page_size > settings.analytics_export_max_rows:
        raise InvalidRequestError(f"Export row count exceeds the configured maximum of {settings.analytics_export_max_rows}.", status_code=413)
    if date_from and date_to and date_from > date_to:
        raise InvalidRequestError("date_from must be earlier than or equal to date_to.")
    statement = select(PredictionRecord).order_by(PredictionRecord.prediction_timestamp.desc()).limit(page_size)
    if model_reference_id:
        statement = statement.where(PredictionRecord.model_reference_id == model_reference_id)
    if predicted_class:
        statement = statement.where(PredictionRecord.predicted_class == predicted_class)
    if date_from:
        statement = statement.where(PredictionRecord.prediction_timestamp >= date_from)
    if date_to:
        statement = statement.where(PredictionRecord.prediction_timestamp <= date_to)
    records = list(session.scalars(statement))
    report = ReportService(AnalyticsService(settings, session), ModelRegistryService(settings, session))
    return _download(report.predictions_csv(records), "text/csv; charset=utf-8", "aps-prediction-history.csv")


def _download(content: bytes, media_type: str, filename: str) -> StreamingResponse:
    return StreamingResponse(iter([content]), media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
