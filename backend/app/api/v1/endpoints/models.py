"""Model catalog, training and registry endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.database.session import get_db
from app.schemas.models import (
    EvaluationMetricsResponse,
    ModelCatalogResponse,
    ModelName,
    ModelVersionsResponse,
    TrainingRequest,
    TrainingRunDetailResponse,
    TrainingRunListResponse,
    TrainingStatusResponse,
)
from app.services.model_training.service import TrainingService, execute_training_background


router = APIRouter(prefix="/models", tags=["models"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_training_service(settings: Settings = Depends(get_settings), session: Session = Depends(get_db)) -> TrainingService:
    return TrainingService(settings, session)


@router.get("", response_model=ModelCatalogResponse, summary="List supported model families and versions")
def list_models(service: TrainingService = Depends(get_training_service)) -> ModelCatalogResponse:
    return service.catalog()


@router.get("/runs", response_model=TrainingRunListResponse, summary="List model training runs")
def list_training_runs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_name: ModelName | None = Query(default=None),
    run_status: str | None = Query(default=None, alias="status", pattern="^(queued|running|completed|failed)$"),
    service: TrainingService = Depends(get_training_service),
) -> TrainingRunListResponse:
    return service.list_runs(page, page_size, model_name, run_status)


@router.get("/versions/{model_name}", response_model=ModelVersionsResponse, summary="List available model versions")
def model_versions(model_name: ModelName, service: TrainingService = Depends(get_training_service)) -> ModelVersionsResponse:
    return service.versions(model_name)


@router.post("/train", response_model=TrainingRunDetailResponse, status_code=status.HTTP_202_ACCEPTED, summary="Start a model training run")
def start_training(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    service: TrainingService = Depends(get_training_service),
) -> TrainingRunDetailResponse:
    run = service.create_queued_run(request)
    background_tasks.add_task(execute_training_background, service.settings, run.run_id, request)
    return service.detail(run.run_id)


@router.get("/runs/{run_id}", response_model=TrainingRunDetailResponse, summary="Get training-run details")
def training_run_detail(run_id: str, service: TrainingService = Depends(get_training_service)) -> TrainingRunDetailResponse:
    return service.detail(run_id)


@router.get("/runs/{run_id}/metadata", response_model=TrainingRunDetailResponse, summary="Get model metadata")
def training_run_metadata(run_id: str, service: TrainingService = Depends(get_training_service)) -> TrainingRunDetailResponse:
    return service.detail(run_id)


@router.get("/runs/{run_id}/status", response_model=TrainingStatusResponse, summary="Check training status")
def training_run_status(run_id: str, service: TrainingService = Depends(get_training_service)) -> TrainingStatusResponse:
    return service.status(run_id)


@router.get("/runs/{run_id}/metrics", response_model=EvaluationMetricsResponse, summary="Get validation metrics")
def training_run_metrics(run_id: str, service: TrainingService = Depends(get_training_service)) -> EvaluationMetricsResponse:
    return service.metrics(run_id)
