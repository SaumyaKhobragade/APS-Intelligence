"""Comparative experimentation and model-comparison endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.database.session import get_db
from app.schemas.experiments import (
    ExperimentBatchRequest,
    ExperimentBatchResponse,
    ExperimentCompareRequest,
    ExperimentComparisonResponse,
    ExperimentConfigurationResponse,
    ExperimentListResponse,
    ExperimentRequest,
    ExperimentRunDetailResponse,
    ImbalanceStrategy,
    FeatureImportanceItem,
    CurveDataResponse,
)
from app.schemas.models import ModelName
from app.services.experimentation.service import ExperimentService, execute_experiment_background


router = APIRouter(prefix="/experiments", tags=["experiments"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_experiment_service(settings: Settings = Depends(get_settings), session: Session = Depends(get_db)) -> ExperimentService:
    return ExperimentService(settings, session)


@router.post("", response_model=ExperimentRunDetailResponse, status_code=status.HTTP_202_ACCEPTED, summary="Start a comparative experiment")
def start_experiment(
    request: ExperimentRequest,
    background_tasks: BackgroundTasks,
    service: ExperimentService = Depends(get_experiment_service),
) -> ExperimentRunDetailResponse:
    run = service.create_queued(request)
    background_tasks.add_task(execute_experiment_background, service.settings, run.experiment_id, request)
    return service.detail(run.experiment_id)


@router.post("/batch", response_model=ExperimentBatchResponse, status_code=status.HTTP_202_ACCEPTED, summary="Queue a comparative experiment batch")
def start_experiment_batch(
    request: ExperimentBatchRequest,
    background_tasks: BackgroundTasks,
    service: ExperimentService = Depends(get_experiment_service),
) -> ExperimentBatchResponse:
    requests: list[ExperimentRequest] = []
    for model_name in dict.fromkeys(request.model_names):
        for imbalance_strategy in dict.fromkeys(request.imbalance_strategies):
            requests.append(
                ExperimentRequest(
                    dataset_id=request.dataset_id,
                    model_name=model_name,
                    imbalance_strategy=imbalance_strategy,
                    preprocessing_strategy=request.preprocessing_strategy,
                    constant_value=request.constant_value,
                    add_missingness_indicators=request.add_missingness_indicators,
                    validation_ratio=request.validation_ratio,
                    random_seed=request.random_seed,
                    threshold=request.threshold,
                    false_positive_cost=request.false_positive_cost,
                    false_negative_cost=request.false_negative_cost,
                    class_imbalance=request.class_imbalance,
                    hyperparameters=request.hyperparameters_by_model.get(model_name, {}),
                    optimize_hyperparameters=request.optimize_hyperparameters,
                    search_budget=request.search_budget,
                    cv_folds=request.cv_folds,
                    search_n_jobs=request.search_n_jobs,
                    smote_k_neighbors=request.smote_k_neighbors,
                )
            )
    response = service.create_batch(requests)
    for experiment_id, experiment_request in zip(response.experiment_ids, requests):
        background_tasks.add_task(execute_experiment_background, service.settings, experiment_id, experiment_request)
    return response


@router.get("", response_model=ExperimentListResponse, summary="List comparative experiments")
def list_experiments(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_name: ModelName | None = Query(default=None),
    imbalance_strategy: ImbalanceStrategy | None = Query(default=None),
    service: ExperimentService = Depends(get_experiment_service),
) -> ExperimentListResponse:
    return service.list_runs(page, page_size, model_name, imbalance_strategy)


@router.post("/compare", response_model=ExperimentComparisonResponse, summary="Compare completed experiment runs")
def compare_experiments(request: ExperimentCompareRequest, service: ExperimentService = Depends(get_experiment_service)) -> ExperimentComparisonResponse:
    return service.compare(request.experiment_ids)


@router.get("/{experiment_id}", response_model=ExperimentRunDetailResponse, summary="Get experiment details")
def experiment_detail(experiment_id: str, service: ExperimentService = Depends(get_experiment_service)) -> ExperimentRunDetailResponse:
    return service.detail(experiment_id)


@router.get("/{experiment_id}/configuration", response_model=ExperimentConfigurationResponse, summary="Get experiment configuration")
def experiment_configuration(experiment_id: str, service: ExperimentService = Depends(get_experiment_service)) -> ExperimentConfigurationResponse:
    return service.configuration(experiment_id)


@router.get("/{experiment_id}/curves", response_model=CurveDataResponse, summary="Get validation PR and ROC curves")
def experiment_curves(experiment_id: str, service: ExperimentService = Depends(get_experiment_service)) -> CurveDataResponse:
    return service.curves(experiment_id)


@router.get("/{experiment_id}/feature-importance", response_model=list[FeatureImportanceItem], summary="Get feature importance")
def experiment_feature_importance(experiment_id: str, service: ExperimentService = Depends(get_experiment_service)) -> list[FeatureImportanceItem]:
    return service.feature_importance(experiment_id)
