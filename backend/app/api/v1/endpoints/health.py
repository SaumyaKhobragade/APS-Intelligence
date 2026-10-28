"""Service health endpoint."""

import uuid

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
    liveness_status: str | None = None
    readiness_status: str | None = None

    if verbose:
        liveness_status = "alive"

        # 1. Database readiness check
        active_engine = getattr(request.app.state, "engine", None)
        if active_engine is None:
            database_status = "unavailable"
        else:
            try:
                verify_database_connection(active_engine)
                database_status = "operational"
            except Exception:
                database_status = "unreachable"

        # 2. Storage write-access diagnostic check
        try:
            if not settings.persistent_storage_dir.is_dir():
                storage_status = "missing"
            else:
                probe_file = settings.persistent_storage_dir / f".health_probe_{uuid.uuid4().hex}"
                try:
                    probe_file.write_bytes(b"probe")
                    if probe_file.is_file():
                        storage_status = "operational"
                    else:
                        storage_status = "degraded"
                finally:
                    if probe_file.exists():
                        try:
                            probe_file.unlink(missing_ok=True)
                        except Exception:
                            pass
        except PermissionError:
            storage_status = "read_only"
        except Exception:
            storage_status = "degraded"

        is_ready = database_status == "operational" and storage_status == "operational"
        readiness_status = "ready" if is_ready else "not_ready"
        overall_status = "ok" if is_ready else "degraded"
    else:
        overall_status = "ok"

    return HealthResponse(
        status=overall_status,
        application_name=settings.app_name,
        application_version=settings.app_version,
        environment=settings.environment,
        api_status="operational",
        database=database_status,
        storage=storage_status,
        liveness=liveness_status,
        readiness=readiness_status,
    )
