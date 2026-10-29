import pytest
from app.core.config import Settings
from app.services.historical_evidence import HistoricalEvidenceService


def test_phase9_comparison_row_hyperparameters_and_details() -> None:
    service = HistoricalEvidenceService(Settings())
    detail = service.validation_detail("phase9-random_forest__original")

    assert detail.reference.reference_id == "phase9-random_forest__original"
    assert detail.reference.model_name == "random_forest"
    assert detail.reference.threshold == 0.5
    assert detail.reference.primary_metric is not None
    assert detail.reference.primary_metric > 0.8

    # Priority 1: Persisted hyperparameters from model_comparison.csv must be present
    hp = detail.reference.hyperparameters
    assert isinstance(hp, dict)
    assert hp.get("n_estimators") == 150
    assert hp.get("max_features") == "log2"
    assert hp.get("min_samples_leaf") == 2

    # Verification: individual artifact files and feature importance were not retained for sweep row
    assert detail.reference.artifact_available is False
    assert detail.reference.feature_importance_available is False
    assert len(detail.feature_importance) == 0


def test_validation_comparison_identifies_feature_importance_availability() -> None:
    service = HistoricalEvidenceService(Settings())
    comparison = service.validation_comparison(page=1, page_size=50)

    # Confirm list has items
    assert len(comparison.items) > 0

    # Phase 9 sweep rows must have feature_importance_available = False
    sweep_rows = [item for item in comparison.items if item.reference_id.startswith("phase9-") and item.reference_id != "phase9-final-validation-candidate"]
    for row in sweep_rows:
        assert row.feature_importance_available is False
        # But should have persisted hyperparameters from model_comparison.csv
        assert len(row.hyperparameters) > 0

    # Phase 4 experiments with feature_importance.json should report True
    phase4_items = [item for item in comparison.items if item.phase == "phase4" and item.status == "completed"]
    has_fi_items = [item for item in phase4_items if item.feature_importance_available is True]
    assert len(has_fi_items) > 0


def test_final_validation_candidate_retains_feature_importance_and_frozen_threshold() -> None:
    service = HistoricalEvidenceService(Settings())
    detail = service.validation_detail("phase9-final-validation-candidate")

    assert detail.reference.reference_id == "phase9-final-validation-candidate"
    assert detail.reference.threshold == 0.115
    assert detail.reference.feature_importance_available is True
    assert len(detail.feature_importance) > 0
    assert detail.reference.artifact_available is True
