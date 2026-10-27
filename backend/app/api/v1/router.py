"""Version 1 API router composition."""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.datasets import router as datasets_router
from app.api.v1.endpoints.models import router as models_router
from app.api.v1.endpoints.experiments import router as experiments_router
from app.api.v1.endpoints.phase5 import router as phase5_router
from app.api.v1.endpoints.predictions import router as predictions_router
from app.api.v1.endpoints.registry import router as registry_router
from app.api.v1.endpoints.historical_evidence import router as historical_evidence_router


router = APIRouter()
router.include_router(health_router)
router.include_router(analytics_router)
router.include_router(datasets_router)
router.include_router(models_router)
router.include_router(experiments_router)
router.include_router(phase5_router)
router.include_router(predictions_router)
router.include_router(registry_router)
router.include_router(historical_evidence_router)

# Future endpoint modules should be included here as they become real backend
# contracts: dashboard, datasets, models, predictions and future analytics.
