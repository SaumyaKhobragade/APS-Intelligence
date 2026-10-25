"""Version 1 API router composition."""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router


router = APIRouter()
router.include_router(health_router)

# Future endpoint modules should be included here as they become real backend
# contracts: dashboard, datasets, models, predictions, thresholds and experiments.
