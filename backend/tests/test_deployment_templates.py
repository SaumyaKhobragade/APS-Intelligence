"""Tests for deployment templates: Nginx, Systemd, PM2, and placeholder safety."""

from pathlib import Path
import pytest
import sys

DEPLOYMENT_DIR = Path(__file__).resolve().parents[2] / "deployment"
sys.path.insert(0, str(DEPLOYMENT_DIR / "scripts"))

from render_nginx_conf import render_nginx_conf


def test_nginx_template_rendering_and_variable_preservation(tmp_path: Path) -> None:
    template_path = DEPLOYMENT_DIR / "nginx" / "aps-intelligence.conf.template"
    output_path = tmp_path / "rendered_nginx.conf"

    render_nginx_conf(
        template_path=template_path,
        output_path=output_path,
        domain="aps.production.example.com",
        ssl_cert="/etc/letsencrypt/live/aps/fullchain.pem",
        ssl_key="/etc/letsencrypt/live/aps/privkey.pem",
    )

    content = output_path.read_text(encoding="utf-8")

    # Designated placeholders must be replaced
    assert "aps.production.example.com" in content
    assert "/etc/letsencrypt/live/aps/fullchain.pem" in content
    assert "/etc/letsencrypt/live/aps/privkey.pem" in content
    assert "${DOMAIN_NAME}" not in content
    assert "${SSL_CERTIFICATE}" not in content
    assert "${SSL_KEY}" not in content

    # Internal Nginx variables must NOT be corrupted
    assert "$host" in content
    assert "$request_uri" in content
    assert "$remote_addr" in content
    assert "$scheme" in content
    assert "$proxy_add_x_forwarded_for" in content
    assert "$http_upgrade" in content
    assert "$connection_upgrade" in content

    # Routing locations must exist
    assert "location /api/ {" in content
    assert "location /docs {" in content
    assert "location /openapi.json {" in content
    assert "location /_next/static/ {" in content
    assert "location / {" in content


def test_systemd_service_binds_to_localhost_and_single_worker() -> None:
    service_path = DEPLOYMENT_DIR / "systemd" / "aps-backend.service"
    content = service_path.read_text(encoding="utf-8")

    assert "--host 127.0.0.1" in content
    assert "--port 8000" in content
    assert "--workers 1" in content
    assert "User=ubuntu" in content
    assert "Group=ubuntu" in content
    assert "Restart=always" in content


def test_pm2_ecosystem_does_not_contain_misleading_public_localhost() -> None:
    pm2_path = DEPLOYMENT_DIR / "pm2" / "ecosystem.config.cjs"
    content = pm2_path.read_text(encoding="utf-8")

    # PM2 should not define NEXT_PUBLIC_API_URL as 127.0.0.1 because client browsers cannot use it
    assert "NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8000'" not in content
    assert "INTERNAL_API_URL" in content
    assert "127.0.0.1" in content
