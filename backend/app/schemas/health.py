"""Schemas for service readiness endpoints."""

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Stable response returned by the versioned health endpoint."""

    model_config = ConfigDict(extra="forbid")

    status: str
    application_name: str
    application_version: str
    environment: str
    api_status: str
    database: str | None = None
    storage: str | None = None
