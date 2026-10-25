"""Typed model-specific hyperparameter configurations."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HyperparameterConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LogisticRegressionHyperparameters(HyperparameterConfig):
    C: float = Field(default=1.0, gt=0)
    max_iter: int = Field(default=1000, ge=100, le=10000)
    solver: Literal["lbfgs", "liblinear", "newton-cg", "newton-cholesky", "sag", "saga"] = "lbfgs"
    penalty: Literal["l2", "l1", "elasticnet", "none"] = "l2"
    l1_ratio: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_solver_penalty(self) -> "LogisticRegressionHyperparameters":
        if self.penalty == "l1" and self.solver not in {"liblinear", "saga"}:
            raise ValueError("l1 penalty requires liblinear or saga solver")
        if self.penalty == "elasticnet" and self.solver != "saga":
            raise ValueError("elasticnet penalty requires saga solver")
        if self.penalty == "elasticnet" and self.l1_ratio is None:
            raise ValueError("elasticnet penalty requires l1_ratio")
        if self.penalty != "elasticnet" and self.l1_ratio is not None:
            raise ValueError("l1_ratio is only valid with elasticnet penalty")
        if self.penalty == "none":
            raise ValueError("Use a regularized penalty; unregularized logistic regression is not supported")
        return self


class RandomForestHyperparameters(HyperparameterConfig):
    n_estimators: int = Field(default=200, ge=10, le=2000)
    max_depth: int | None = Field(default=None, ge=1, le=100)
    min_samples_leaf: int = Field(default=1, ge=1, le=1000)
    max_features: Literal["sqrt", "log2", "none"] = "sqrt"
    n_jobs: int = Field(default=-1, ge=-1, le=128)


class XGBoostHyperparameters(HyperparameterConfig):
    n_estimators: int = Field(default=300, ge=10, le=3000)
    max_depth: int = Field(default=6, ge=1, le=30)
    learning_rate: float = Field(default=0.05, gt=0, le=1)
    subsample: float = Field(default=1.0, gt=0, le=1)
    colsample_bytree: float = Field(default=1.0, gt=0, le=1)
    min_child_weight: float = Field(default=1.0, gt=0)
    reg_lambda: float = Field(default=1.0, ge=0)
    n_jobs: int = Field(default=-1, ge=-1, le=128)


class CatBoostHyperparameters(HyperparameterConfig):
    iterations: int = Field(default=300, ge=10, le=3000)
    depth: int = Field(default=6, ge=1, le=16)
    learning_rate: float = Field(default=0.05, gt=0, le=1)
    l2_leaf_reg: float = Field(default=3.0, ge=0)
    thread_count: int = Field(default=-1, ge=-1, le=128)
