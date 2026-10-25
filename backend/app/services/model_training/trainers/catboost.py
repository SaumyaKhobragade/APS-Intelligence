"""CatBoost trainer with explicit class-weight handling."""

from typing import Any

from pydantic import BaseModel

from app.services.model_training.trainers.base import ImbalanceSettings, ModelTrainer
from app.services.model_training.trainers.configs import CatBoostHyperparameters


class CatBoostTrainer(ModelTrainer):
    name = "catboost"
    hyperparameter_model = CatBoostHyperparameters

    @classmethod
    def build_estimator(
        cls,
        hyperparameters: BaseModel,
        *,
        imbalance: ImbalanceSettings,
        random_seed: int,
    ) -> Any:
        from catboost import CatBoostClassifier

        config = CatBoostHyperparameters.model_validate(hyperparameters)
        class_weights = None
        if imbalance.mode == "balanced":
            class_weights = [imbalance.negative_weight, imbalance.positive_weight]
        elif imbalance.mode == "custom":
            class_weights = [imbalance.negative_weight, imbalance.positive_weight]
        return CatBoostClassifier(
            iterations=config.iterations,
            depth=config.depth,
            learning_rate=config.learning_rate,
            l2_leaf_reg=config.l2_leaf_reg,
            thread_count=config.thread_count,
            random_seed=random_seed,
            class_weights=class_weights,
            loss_function="Logloss",
            eval_metric="PRAUC",
            verbose=False,
            allow_writing_files=False,
        )
