"""Service health endpoint."""

from fastapi import APIRouter, Query, Request

from app.database.session import verify_database_connection
from app.schemas.health import HealthResponse


router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    response_model_exclude_none=True,
    summary="Check API health",
)
def health(
    request: Request,
    verbose: bool = Query(default=False, description="Include dependency diagnostics."),
) -> HealthResponse:
    """Return process and API contract status without touching application data."""

    settings = request.app.state.settings
    database_status: str | None = None
    storage_status: str | None = None

    if verbose:
        try:
            active_engine = getattr(request.app.state, "engine", None)
            if active_engine is not None:
                verify_database_connection(active_engine)
            database_status = "operational"
        except Exception:
            database_status = "degraded"

        try:
            if settings.persistent_storage_dir.is_dir():
                storage_status = "operational"
            else:
                storage_status = "degraded"
        except Exception:
            storage_status = "degraded"

    overall_status = "ok"
    if verbose and (database_status == "degraded" or storage_status == "degraded"):
        overall_status = "degraded"

    return HealthResponse(
        status=overall_status,
        application_name=settings.app_name,
        application_version=settings.app_version,
        environment=settings.environment,
        api_status="operational",
        database=database_status,
        storage=storage_status,
    )
