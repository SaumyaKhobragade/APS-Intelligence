"""Random Forest trainer."""

from typing import Any

from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier

from app.services.model_training.trainers.base import ImbalanceSettings, ModelTrainer
from app.services.model_training.trainers.configs import RandomForestHyperparameters


class RandomForestTrainer(ModelTrainer):
    name = "random_forest"
    hyperparameter_model = RandomForestHyperparameters

    @classmethod
    def build_estimator(
        cls,
        hyperparameters: BaseModel,
        *,
        imbalance: ImbalanceSettings,
        random_seed: int,
    ) -> Any:
        config = RandomForestHyperparameters.model_validate(hyperparameters)
        class_weight: str | dict[int, float] | None
        if imbalance.mode == "balanced":
            class_weight = "balanced"
        elif imbalance.mode == "custom":
            class_weight = {0: imbalance.negative_weight, 1: imbalance.positive_weight}
        else:
            class_weight = None
        max_features: str | None = None if config.max_features == "none" else config.max_features
        return RandomForestClassifier(
            n_estimators=config.n_estimators,
            max_depth=config.max_depth,
            min_samples_leaf=config.min_samples_leaf,
            max_features=max_features,
            n_jobs=config.n_jobs,
            class_weight=class_weight,
            random_state=random_seed,
        )
