"""Automated regression test for release lifecycle and configuration isolation."""

from pathlib import Path
import sys

DEPLOYMENT_SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "deployment" / "scripts"
if str(DEPLOYMENT_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(DEPLOYMENT_SCRIPTS_DIR))

from verify_release_lifecycle import run_release_verification


def test_release_lifecycle_verification_passes() -> None:
    result = run_release_verification()
    assert result == 0, "Release lifecycle verification must exit cleanly with code 0"
