"""Single-instance vehicle failure inference and prediction history endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.database.session import get_db
from app.schemas.predictions import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    DecisionPolicyListResponse,
    DecisionPolicySummary,
    FeatureSchemaResponse,
    ModelReferenceType,
    PredictionClass,
    PredictionHistoryResponse,
    PredictionModelListResponse,
    PredictionReference,
    PredictionRequest,
    PredictionResponse,
    PolicyRegistrationRequest,
)
from app.services.prediction.inference import InferenceCache, InferenceService


router = APIRouter(prefix="/predictions", tags=["predictions"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_prediction_service(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db),
) -> InferenceService:
    cache = getattr(request.app.state, "inference_cache", None)
    if cache is None:
        cache = InferenceCache(settings.prediction_model_cache_size)
    return InferenceService(settings, session, cache)


@router.get("/models", response_model=PredictionModelListResponse, summary="List completed models available for inference")
def list_prediction_models(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: InferenceService = Depends(get_prediction_service),
) -> PredictionModelListResponse:
    return service.list_models(page, page_size)


@router.get("/policies", response_model=DecisionPolicyListResponse, summary="List registered decision policies")
def list_decision_policies(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_reference_id: str | None = Query(default=None, min_length=1, max_length=80),
    model_reference_type: ModelReferenceType | None = Query(default=None),
    service: InferenceService = Depends(get_prediction_service),
) -> DecisionPolicyListResponse:
    return service.list_policies(
        page,
        page_size,
        model_reference_id=model_reference_id,
        model_reference_type=model_reference_type,
    )


@router.post(
    "/policies",
    response_model=DecisionPolicySummary,
    status_code=status.HTTP_201_CREATED,
    summary="Register a trusted Phase 5 decision policy for inference",
)
def register_decision_policy(
    request: PolicyRegistrationRequest,
    service: InferenceService = Depends(get_prediction_service),
) -> DecisionPolicySummary:
    return service.register_policy(request)


@router.get(
    "/models/{model_reference_type}/{model_reference_id}/features",
    response_model=FeatureSchemaResponse,
    summary="Get the exact feature contract for a registered inference model",
)
def prediction_feature_schema(
    model_reference_type: ModelReferenceType,
    model_reference_id: str,
    service: InferenceService = Depends(get_prediction_service),
) -> FeatureSchemaResponse:
    reference = (
        PredictionReference(model_run_id=model_reference_id)
        if model_reference_type == "training_run"
        else PredictionReference(experiment_id=model_reference_id)
    )
    return service.feature_schema(reference)


@router.post("", response_model=PredictionResponse, status_code=status.HTTP_201_CREATED, summary="Predict one vehicle failure outcome")
def predict_single(
    request: PredictionRequest,
    service: InferenceService = Depends(get_prediction_service),
) -> PredictionResponse:
    return service.predict(request)


@router.post("/batch", response_model=BatchPredictionResponse, summary="Predict multiple vehicle failure outcomes")
def predict_batch(
    request: BatchPredictionRequest,
    service: InferenceService = Depends(get_prediction_service),
) -> BatchPredictionResponse:
    return service.predict_batch(request)


@router.get("", response_model=PredictionHistoryResponse, summary="List persisted prediction history")
def list_prediction_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_reference_id: str | None = Query(default=None, min_length=1, max_length=80),
    model_reference_type: ModelReferenceType | None = Query(default=None),
    predicted_class: PredictionClass | None = Query(default=None),
    vehicle_identifier: str | None = Query(default=None, min_length=1, max_length=128),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    service: InferenceService = Depends(get_prediction_service),
) -> PredictionHistoryResponse:
    return service.list_predictions(
        page,
        page_size,
        model_reference_id=model_reference_id,
        model_reference_type=model_reference_type,
        predicted_class=predicted_class,
        vehicle_identifier=vehicle_identifier,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{prediction_id}", response_model=PredictionResponse, summary="Get one persisted prediction")
def prediction_detail(
    prediction_id: str,
    service: InferenceService = Depends(get_prediction_service),
) -> PredictionResponse:
    return service.get_prediction(prediction_id)
