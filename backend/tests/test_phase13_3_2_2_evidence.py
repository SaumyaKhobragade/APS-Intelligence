from app.core.config import Settings
from app.services.historical_evidence import HistoricalEvidenceService
from fastapi.testclient import TestClient
from app.main import app


def test_calibration_method_candidate_and_comparison_integrity() -> None:
    service = HistoricalEvidenceService(Settings())

    # Candidate has explicit isotonic calibration method from final_candidate.json
    candidate_summary = service._phase9_summary_if_available()
    assert candidate_summary is not None
    assert candidate_summary.calibration_method == "isotonic"

    # Detail preserves calibration_method
    candidate_detail = service.experiment_detail("phase9-final-validation-candidate")
    assert candidate_detail.calibration_method == "isotonic"

    # Sweep comparison rows do not leak calibration method (must be None)
    comparison_rows = service._phase9_comparison_rows()
    assert len(comparison_rows) > 0
    for row in comparison_rows:
        assert row.calibration_method is None

    # Phase 3 and Phase 4 runs have calibration_method = None
    for row in service._phase3_rows():
        p3_summary = service._phase3_summary(row)
        assert p3_summary.calibration_method is None

    for row in service._phase4_rows():
        p4_summary = service._phase4_summary(row)
        assert p4_summary.calibration_method is None


def test_historical_evidence_api_includes_calibration_method() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/historical-evidence/overview")
    assert response.status_code == 200
    data = response.json()

    # Find candidate in validation_comparison
    comparison = data.get("validation_comparison", [])
    candidate_rows = [r for r in comparison if r.get("reference_id") == "phase9-final-validation-candidate"]
    assert len(candidate_rows) == 1
    assert candidate_rows[0].get("calibration_method") == "isotonic"

    # Non-candidate rows should have None
    non_candidate_rows = [r for r in comparison if r.get("reference_id") != "phase9-final-validation-candidate"]
    for row in non_candidate_rows:
        assert row.get("calibration_method") is None
