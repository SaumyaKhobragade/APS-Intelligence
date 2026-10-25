"""Service health endpoint."""

from fastapi import APIRouter, Query, Request

from app.schemas.health import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Check API health")
def health(request: Request, verbose: bool = Query(default=False, description="Reserved for future dependency diagnostics.")) -> HealthResponse:
    """Return process and API contract status without touching application data."""

    settings = request.app.state.settings
    _ = verbose
    return HealthResponse(
        status="ok",
        application_name=settings.app_name,
        application_version=settings.app_version,
        environment=settings.environment,
        api_status="operational",
    )
