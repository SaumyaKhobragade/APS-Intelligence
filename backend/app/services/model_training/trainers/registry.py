"""Registry of supported model trainer implementations."""

from typing import Any

from app.services.model_training.trainers.base import ModelTrainer
from app.services.model_training.trainers.catboost import CatBoostTrainer
from app.services.model_training.trainers.logistic_regression import LogisticRegressionTrainer
from app.services.model_training.trainers.random_forest import RandomForestTrainer
from app.services.model_training.trainers.xgboost import XGBoostTrainer


TRAINER_REGISTRY: dict[str, type[ModelTrainer]] = {
    LogisticRegressionTrainer.name: LogisticRegressionTrainer,
    RandomForestTrainer.name: RandomForestTrainer,
    XGBoostTrainer.name: XGBoostTrainer,
    CatBoostTrainer.name: CatBoostTrainer,
}


def get_trainer(model_name: str) -> type[ModelTrainer]:
    try:
        return TRAINER_REGISTRY[model_name]
    except KeyError as exc:
        supported = ", ".join(sorted(TRAINER_REGISTRY))
        raise ValueError(f"Unsupported model '{model_name}'. Supported models: {supported}.") from exc


def list_trainers() -> list[dict[str, Any]]:
    return [TRAINER_REGISTRY[name].describe() for name in sorted(TRAINER_REGISTRY)]
