"""Phase 7 model registry, lineage, promotion and reproducibility endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.database.session import get_db
from app.schemas.registry import (
    ArtifactInventoryResponse,
    ModelLineageResponse,
    ModelVersionHistoryResponse,
    PromotionListResponse,
    PromotionRequest,
    PromotionSummary,
    RegistryDetailResponse,
    RegistryLifecycleRequest,
    RegistryListResponse,
    RegistryReferenceType,
    ReproducibilityResponse,
)
from app.services.registry import ModelRegistryService


router = APIRouter(prefix="/models", tags=["model-registry"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_registry_service(
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db),
) -> ModelRegistryService:
    return ModelRegistryService(settings, session)


@router.get("/registry", response_model=RegistryListResponse, summary="List model and experiment registry versions")
def list_registry_models(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    model_name: str | None = Query(default=None, min_length=1, max_length=64),
    lifecycle_status: str | None = Query(default=None, min_length=1, max_length=32),
    execution_status: str | None = Query(default=None, min_length=1, max_length=32),
    dataset_id: str | None = Query(default=None, min_length=1, max_length=80),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    service: ModelRegistryService = Depends(get_registry_service),
) -> RegistryListResponse:
    return service.list_models(
        page,
        page_size,
        model_name=model_name,
        lifecycle_status=lifecycle_status,
        execution_status=execution_status,
        dataset_id=dataset_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/registry/versions/{model_name}", response_model=ModelVersionHistoryResponse, summary="List model version history")
def model_version_history(
    model_name: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: ModelRegistryService = Depends(get_registry_service),
) -> ModelVersionHistoryResponse:
    return service.version_history(model_name, page, page_size)


@router.get("/promotions", response_model=PromotionListResponse, summary="List auditable default-model promotions")
def list_promotions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: ModelRegistryService = Depends(get_registry_service),
) -> PromotionListResponse:
    return service.list_promotions(page, page_size)


@router.post("/promotions/{promotion_id}/revert", response_model=PromotionSummary, summary="Revert the active default-model promotion")
def revert_promotion(
    promotion_id: str,
    service: ModelRegistryService = Depends(get_registry_service),
) -> PromotionSummary:
    return service.revert_promotion(promotion_id)


@router.get("/registry/{reference_type}/{reference_id}", response_model=RegistryDetailResponse, summary="Get complete registry metadata")
def registry_detail(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ModelRegistryService = Depends(get_registry_service),
) -> RegistryDetailResponse:
    return service.detail(reference_type, reference_id)


@router.post("/registry/{reference_type}/{reference_id}/lifecycle", response_model=RegistryDetailResponse, summary="Transition a model registry lifecycle state")
def transition_lifecycle(
    reference_type: RegistryReferenceType,
    reference_id: str,
    request: RegistryLifecycleRequest,
    service: ModelRegistryService = Depends(get_registry_service),
) -> RegistryDetailResponse:
    return service.transition(reference_type, reference_id, request)


@router.post("/registry/{reference_type}/{reference_id}/promote", response_model=PromotionSummary, status_code=status.HTTP_201_CREATED, summary="Explicitly promote an eligible model and policy")
def promote_model(
    reference_type: RegistryReferenceType,
    reference_id: str,
    request: PromotionRequest,
    service: ModelRegistryService = Depends(get_registry_service),
) -> PromotionSummary:
    return service.promote(reference_type, reference_id, request)


@router.get("/registry/{reference_type}/{reference_id}/lineage", response_model=ModelLineageResponse, summary="Get model, dataset, split and policy lineage")
def registry_lineage(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ModelRegistryService = Depends(get_registry_service),
) -> ModelLineageResponse:
    return service.lineage(reference_type, reference_id)


@router.get("/registry/{reference_type}/{reference_id}/artifacts", response_model=ArtifactInventoryResponse, summary="Verify registered artifact inventory")
def registry_artifacts(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ModelRegistryService = Depends(get_registry_service),
) -> ArtifactInventoryResponse:
    return service.verify_artifacts(reference_type, reference_id)


@router.get("/registry/{reference_type}/{reference_id}/reproducibility", response_model=ReproducibilityResponse, summary="Check reproducibility prerequisites")
def registry_reproducibility(
    reference_type: RegistryReferenceType,
    reference_id: str,
    service: ModelRegistryService = Depends(get_registry_service),
) -> ReproducibilityResponse:
    return service.reproducibility(reference_type, reference_id)
