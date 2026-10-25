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
        return LogisticRegression(
            C=config.C,
            max_iter=config.max_iter,
            solver=config.solver,
            penalty=config.penalty,
            l1_ratio=config.l1_ratio,
            class_weight=class_weight,
            random_state=random_seed,
        )
