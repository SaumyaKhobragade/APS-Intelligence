"""Logistic Regression trainer."""

from typing import Any

from pydantic import BaseModel
from sklearn.linear_model import LogisticRegression

from app.services.model_training.trainers.base import ImbalanceSettings, ModelTrainer
from app.services.model_training.trainers.configs import LogisticRegressionHyperparameters


class LogisticRegressionTrainer(ModelTrainer):
    name = "logistic_regression"
    hyperparameter_model = LogisticRegressionHyperparameters

    @classmethod
    def build_estimator(
        cls,
        hyperparameters: BaseModel,
        *,
        imbalance: ImbalanceSettings,
        random_seed: int,
    ) -> Any:
        config = LogisticRegressionHyperparameters.model_validate(hyperparameters)
        class_weight: str | dict[int, float] | None
        if imbalance.mode == "balanced":
            class_weight = "balanced"
        elif imbalance.mode == "custom":
            class_weight = {0: imbalance.negative_weight, 1: imbalance.positive_weight}
        else:
            class_weight = None
        parameters: dict[str, Any] = {
            "C": config.C,
            "max_iter": config.max_iter,
            "solver": config.solver,
            "class_weight": class_weight,
            "random_state": random_seed,
        }
        # The default regularized penalty is l2 across supported sklearn
        # versions. Omitting it avoids the deprecation path introduced in
        # newer sklearn releases while preserving the configured behavior.
        if config.penalty != "l2":
            parameters["penalty"] = config.penalty
        if config.penalty == "elasticnet":
            parameters["l1_ratio"] = config.l1_ratio
        return LogisticRegression(**parameters)
