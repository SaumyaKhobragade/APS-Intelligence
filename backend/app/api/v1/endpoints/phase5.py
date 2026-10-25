"""Phase 5 threshold, calibration and cost-sensitive decision endpoints."""

from fastapi import APIRouter, Depends, Request

from app.core.config import Settings
from app.database.session import get_db
from app.schemas.phase5 import (
    CalibrationComparisonRequest,
    CalibrationComparisonResponse,
    CalibrationMetricsResponse,
    DecisionPolicyComparisonRequest,
    DecisionPolicyComparisonResponse,
    ThresholdAnalysisResponse,
    ThresholdOptimizationRequest,
    ThresholdPoint,
    ThresholdPolicyCompareRequest,
    ThresholdPolicyComparisonResponse,
)
from app.services.phase5 import Phase5Service
from sqlalchemy.orm import Session


router = APIRouter(tags=["phase5"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_phase5_service(settings: Settings = Depends(get_settings), session: Session = Depends(get_db)) -> Phase5Service:
    return Phase5Service(settings, session)


@router.post("/thresholds/{reference_id}/analyze", response_model=ThresholdAnalysisResponse, summary="Generate validation threshold analysis")
def analyze_thresholds(
    reference_id: str,
    request: ThresholdOptimizationRequest,
    service: Phase5Service = Depends(get_phase5_service),
) -> ThresholdAnalysisResponse:
    return service.threshold_analysis(reference_id, request)


@router.get("/thresholds/{reference_id}", response_model=ThresholdAnalysisResponse, summary="Retrieve threshold optimization results")
def get_thresholds(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> ThresholdAnalysisResponse:
    return service.get_threshold_analysis(reference_id)


@router.get("/thresholds/{reference_id}/curve", response_model=list[ThresholdPoint], summary="Retrieve machine-readable threshold curve")
def get_threshold_curve(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> list[ThresholdPoint]:
    return service.get_threshold_analysis(reference_id).candidates


@router.post("/thresholds/{reference_id}/compare", response_model=ThresholdPolicyComparisonResponse, summary="Compare explicit threshold policies")
def compare_thresholds(
    reference_id: str,
    request: ThresholdPolicyCompareRequest,
    service: Phase5Service = Depends(get_phase5_service),
) -> ThresholdPolicyComparisonResponse:
    return service.threshold_policy_comparison(reference_id, request)


@router.post("/calibration/{reference_id}/compare", response_model=CalibrationComparisonResponse, summary="Generate training-only calibration comparison")
def compare_calibration(
    reference_id: str,
    request: CalibrationComparisonRequest,
    service: Phase5Service = Depends(get_phase5_service),
) -> CalibrationComparisonResponse:
    return service.calibration_comparison(reference_id, request)


@router.get("/calibration/{reference_id}", response_model=CalibrationComparisonResponse, summary="Retrieve calibration comparison")
def get_calibration(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> CalibrationComparisonResponse:
    return service.get_calibration_comparison(reference_id)


@router.get("/calibration/{reference_id}/metrics", response_model=CalibrationMetricsResponse, summary="Retrieve calibration metrics")
def get_calibration_metrics(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> CalibrationMetricsResponse:
    return service.get_calibration_metrics(reference_id)


@router.get("/calibration/{reference_id}/reliability", response_model=CalibrationComparisonResponse, summary="Retrieve reliability-curve data")
def get_reliability_curves(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> CalibrationComparisonResponse:
    return service.get_calibration_comparison(reference_id)


@router.post("/decision-policies/{reference_id}/compare", response_model=DecisionPolicyComparisonResponse, summary="Compare calibrated and thresholded decision policies")
def compare_decision_policies(
    reference_id: str,
    request: DecisionPolicyComparisonRequest,
    service: Phase5Service = Depends(get_phase5_service),
) -> DecisionPolicyComparisonResponse:
    return service.decision_policy_comparison(reference_id, request)


@router.get("/decision-policies/{reference_id}", response_model=DecisionPolicyComparisonResponse, summary="Retrieve decision-policy comparison")
def get_decision_policies(reference_id: str, service: Phase5Service = Depends(get_phase5_service)) -> DecisionPolicyComparisonResponse:
    return service.get_decision_policy_comparison(reference_id)
