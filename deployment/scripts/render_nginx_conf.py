"""Safe Nginx Configuration Template Renderer.

Substitutes designated deployment placeholders without corrupting internal Nginx variables
such as $host, $remote_addr, $request_uri, or $scheme.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys

PLACEHOLDER_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)\}")


def render_nginx_conf(
    template_path: Path,
    output_path: Path,
    domain: str,
    ssl_cert: str = "/etc/ssl/certs/ssl-cert-snakeoil.pem",
    ssl_key: str = "/etc/ssl/private/ssl-cert-snakeoil.key",
) -> None:
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    content = template_path.read_text(encoding="utf-8")

    substitutions = {
        "DOMAIN_NAME": domain,
        "SSL_CERTIFICATE": ssl_cert,
        "SSL_KEY": ssl_key,
    }

    def replace_match(match: re.Match[str]) -> str:
        var_name = match.group(1)
        if var_name in substitutions:
            return substitutions[var_name]
        return match.group(0)

    rendered = PLACEHOLDER_PATTERN.sub(replace_match, content)

    # Validate that no unexpanded ${...} placeholders remain
    remaining = PLACEHOLDER_PATTERN.findall(rendered)
    if remaining:
        raise ValueError(f"Unexpanded placeholders remain in Nginx configuration: {remaining}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    print(f"[+] Successfully rendered Nginx config to: {output_path}")
    print(f"    Domain: {domain}")
    print(f"    SSL Cert: {ssl_cert}")
    print(f"    SSL Key: {ssl_key}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Render APS Intelligence Nginx configuration template")
    parser.add_argument("--template", type=Path, default=Path(__file__).resolve().parent.parent / "nginx" / "aps-intelligence.conf.template")
    parser.add_argument("--output", type=Path, required=True, help="Destination file path (e.g. /etc/nginx/sites-available/aps-intelligence.conf)")
    parser.add_argument("--domain", type=str, required=True, help="Public domain name (e.g. aps.yourdomain.com)")
    parser.add_argument("--ssl-cert", type=str, default="/etc/ssl/certs/ssl-cert-snakeoil.pem", help="Path to SSL certificate")
    parser.add_argument("--ssl-key", type=str, default="/etc/ssl/private/ssl-cert-snakeoil.key", help="Path to SSL private key")

    args = parser.parse_args()
    try:
        render_nginx_conf(
            template_path=args.template,
            output_path=args.output,
            domain=args.domain,
            ssl_cert=args.ssl_cert,
            ssl_key=args.ssl_key,
        )
    except Exception as e:
        print(f"[-] Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
