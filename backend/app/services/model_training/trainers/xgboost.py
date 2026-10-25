"""XGBoost trainer with explicit scale_pos_weight handling."""

from typing import Any

from pydantic import BaseModel

from app.services.model_training.trainers.base import ImbalanceSettings, ModelTrainer
from app.services.model_training.trainers.configs import XGBoostHyperparameters


class XGBoostTrainer(ModelTrainer):
    name = "xgboost"
    hyperparameter_model = XGBoostHyperparameters

    @classmethod
    def build_estimator(
        cls,
        hyperparameters: BaseModel,
        *,
        imbalance: ImbalanceSettings,
        random_seed: int,
    ) -> Any:
        from xgboost import XGBClassifier

        config = XGBoostHyperparameters.model_validate(hyperparameters)
        scale_pos_weight = imbalance.scale_pos_weight if imbalance.mode != "none" else 1.0
        return XGBClassifier(
            n_estimators=config.n_estimators,
            max_depth=config.max_depth,
            learning_rate=config.learning_rate,
            subsample=config.subsample,
            colsample_bytree=config.colsample_bytree,
            min_child_weight=config.min_child_weight,
            reg_lambda=config.reg_lambda,
            n_jobs=config.n_jobs,
            random_state=random_seed,
            objective="binary:logistic",
            eval_metric="logloss",
            scale_pos_weight=scale_pos_weight,
            tree_method="hist",
            verbosity=0,
        )
