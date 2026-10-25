"""Tests for standardized model evaluation metrics."""

from app.services.model_training.evaluation import evaluate_binary_classifier


def test_evaluation_metrics_and_confusion_matrix_are_consistent() -> None:
    metrics = evaluate_binary_classifier(
        [0, 0, 0, 1, 1, 1],
        [0.1, 0.8, 0.2, 0.9, 0.4, 0.7],
        threshold=0.5,
        false_positive_cost=2.0,
        false_negative_cost=5.0,
    )

    assert metrics.pr_auc is not None
    assert metrics.roc_auc is not None
    assert metrics.confusion_matrix.matrix == [[2, 1], [1, 2]]
    assert metrics.confusion_matrix.true_negative == 2
    assert metrics.confusion_matrix.false_positive == 1
    assert metrics.confusion_matrix.false_negative == 1
    assert metrics.confusion_matrix.true_positive == 2
    assert metrics.estimated_business_cost == 7.0
    assert metrics.primary_metric == "pr_auc"


def test_evaluation_handles_single_class_validation_without_crashing() -> None:
    metrics = evaluate_binary_classifier([0, 0], [0.1, 0.2], threshold=0.5)

    assert metrics.pr_auc is None
    assert metrics.roc_auc is None
    assert metrics.precision == 0.0
    assert metrics.recall == 0.0
    assert metrics.f1_score == 0.0
    assert metrics.confusion_matrix.matrix == [[2, 0], [0, 0]]
