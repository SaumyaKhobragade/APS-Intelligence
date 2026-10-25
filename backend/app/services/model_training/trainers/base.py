"""Common interface for extensible model trainers."""

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict


class ImbalanceSettings(BaseModel):
    """Resolved class-imbalance settings passed to a model trainer."""

    model_config = ConfigDict(extra="forbid")

    mode: str
    negative_weight: float = 1.0
    positive_weight: float = 1.0
    scale_pos_weight: float = 1.0


class ModelTrainer(ABC):
    """Interface implemented by every supported estimator family."""

    name: ClassVar[str]
    version: ClassVar[str] = "1.0.0"
    hyperparameter_model: ClassVar[type[BaseModel]]

    @classmethod
    def validate_hyperparameters(cls, values: dict[str, Any]) -> BaseModel:
        return cls.hyperparameter_model.model_validate(values)

    @classmethod
    @abstractmethod
    def build_estimator(
        cls,
        hyperparameters: BaseModel,
        *,
        imbalance: ImbalanceSettings,
        random_seed: int,
    ) -> Any:
        """Build an unfitted estimator from validated configuration."""

    @classmethod
    def describe(cls) -> dict[str, str]:
        return {"name": cls.name, "version": cls.version, "display_name": cls.name.replace("_", " ").title()}
