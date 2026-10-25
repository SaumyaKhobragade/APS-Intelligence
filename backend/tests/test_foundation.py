"""Tests for the backend foundation, independent of production artifacts."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.database.session import create_database_engine, create_session_factory, get_db


def test_application_starts_and_health_endpoint_returns_contract(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "application_name": "APS Intelligence Test API",
        "application_version": "test",
        "environment": "test",
        "api_status": "operational",
    }


def test_startup_creates_configured_storage_layout(client: TestClient, test_settings: Settings) -> None:
    assert test_settings.persistent_storage_dir.is_dir()
    assert test_settings.dataset_storage_dir.joinpath("raw").is_dir()
    assert test_settings.dataset_storage_dir.joinpath("reference").is_dir()
    assert test_settings.dataset_storage_dir.joinpath("processed").is_dir()
    assert test_settings.model_artifact_dir.is_dir()
    assert test_settings.report_storage_dir.is_dir()


def test_api_version_routing_is_required(client: TestClient) -> None:
    assert client.get("/health").status_code == 404
    assert client.get("/api/v1/health").status_code == 200


def test_configuration_loads_defaults_and_normalizes_values() -> None:
    settings = Settings(api_prefix="api/v1", allowed_cors_origins="http://localhost:3000,http://127.0.0.1:3000")

    assert settings.api_prefix == "/api/v1"
    assert settings.allowed_cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert settings.backend_port == 8000


def test_cors_allows_configured_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://testclient.local",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://testclient.local"


def test_validation_errors_use_stable_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/health?verbose=not-a-boolean")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["details"]


def test_unknown_route_returns_safe_not_found_response(client: TestClient) -> None:
    response = client.get("/api/v1/not-implemented")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"
    assert "traceback" not in response.text.lower()


def test_database_engine_and_session_initialize_in_isolation(tmp_path: Path) -> None:
    settings = Settings(
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'isolated.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts/models",
        report_storage_dir=tmp_path / "artifacts/reports",
    )
    isolated_engine = create_database_engine(settings)

    with isolated_engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1

    session = create_session_factory(isolated_engine)()
    session.close()
    dependency_session = next(get_db())
    dependency_session.close()
    isolated_engine.dispose()
