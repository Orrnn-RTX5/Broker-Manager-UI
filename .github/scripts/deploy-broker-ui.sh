#!/usr/bin/env sh
set -eu

container_name="rtx-manager-${NAME}"
env_file="$(mktemp)"

cleanup() {
  rm -f "$env_file"
}
trap cleanup EXIT

if [ -n "${ENV_FILE_B64:-}" ]; then
  printf '%s' "$ENV_FILE_B64" | base64 -d > "$env_file"
fi

if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
else
  docker login ghcr.io -u "$GHCR_USER"
fi

docker pull "$IMAGE"
docker rm -f "$container_name" >/dev/null 2>&1 || true

conflicts="$(docker ps -aq --filter "publish=${HOST_PORT}" || true)"
if [ -n "$conflicts" ]; then
  docker rm -f $conflicts >/dev/null 2>&1 || true
fi

sleep 2

docker run -d --name "$container_name" --restart unless-stopped \
  --label "com.rtx5.app=broker-manager-ui" \
  --label "com.rtx5.broker=${NAME}" \
  -p "${APP_PORT}:80" \
  --env-file "$env_file" \
  "$IMAGE"

truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

install_apt_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y "$@"
}

ensure_nginx() {
  if command -v nginx >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_apt_packages nginx
    return 0
  fi

  echo "nginx is required for domain deployment but apt-get is not available" >&2
  return 1
}

reload_nginx() {
  nginx -t

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files nginx.service >/dev/null 2>&1; then
    systemctl reload nginx || systemctl restart nginx
    return 0
  fi

  nginx -s reload || nginx
}

ensure_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_apt_packages certbot python3-certbot-nginx
    return 0
  fi

  echo "certbot is required for HTTPS deployment but apt-get is not available" >&2
  return 1
}

ensure_python3() {
  if command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_apt_packages python3
    return 0
  fi

  echo "python3 is required to manage nginx config safely but apt-get is not available" >&2
  return 1
}

ensure_managed_nginx_include() {
  ensure_python3

  python3 <<'PY'
from pathlib import Path
from datetime import datetime
import re
import sys

path = Path("/etc/nginx/nginx.conf")
text = path.read_text()
include_line = "    include /etc/nginx/rtx5-managed/*.conf;"
pattern = re.compile(r"^[ \t]*#?[ \t]*include[ \t]+/etc/nginx/rtx5-managed/\*\.conf;[ \t]*\n?", re.M)
cleaned = pattern.sub("", text)
match = re.search(r"(^[ \t]*http[ \t]*\{[ \t]*(?:\n|$))", cleaned, re.M)

if not match:
    print("Could not find http block in /etc/nginx/nginx.conf", file=sys.stderr)
    sys.exit(1)

updated = cleaned[:match.end()] + include_line + "\n" + cleaned[match.end():]
if updated != text:
    backup = path.with_name(f"nginx.conf.rtx5-backup-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    backup.write_text(text)
    path.write_text(updated)
PY
}

nginx_listen_addr() {
  if [ -z "${NGINX_LISTEN_HOST:-}" ] || [ "$NGINX_LISTEN_HOST" = "null" ]; then
    return
  fi

  if printf '%s' "$NGINX_LISTEN_HOST" | grep -q ':' && ! printf '%s' "$NGINX_LISTEN_HOST" | grep -Eq '^\[.*\]$'; then
    printf '[%s]' "$NGINX_LISTEN_HOST"
    return
  fi

  printf '%s' "$NGINX_LISTEN_HOST"
}

nginx_listen_directives() {
  port="$1"
  suffix="${2:-}"
  listen_addr="$(nginx_listen_addr)"

  if [ -n "$listen_addr" ]; then
    printf '    listen %s:%s%s;\n' "$listen_addr" "$port" "$suffix"
    return
  fi

  printf '    listen %s%s;\n' "$port" "$suffix"
  printf '    listen [::]:%s%s;\n' "$port" "$suffix"
}

openssl_connect_target() {
  connect_host="${NGINX_LISTEN_HOST:-$DOMAIN}"

  if [ -z "$connect_host" ] || [ "$connect_host" = "null" ]; then
    connect_host="$DOMAIN"
  fi

  if printf '%s' "$connect_host" | grep -q ':' && ! printf '%s' "$connect_host" | grep -Eq '^\[.*\]$'; then
    printf '[%s]:443' "$connect_host"
    return
  fi

  printf '%s:443' "$connect_host"
}

served_certificate_matches_domain() {
  command -v openssl >/dev/null 2>&1 || return 1

  cert_text="$(
    echo | openssl s_client -servername "$DOMAIN" -connect "$(openssl_connect_target)" 2>/dev/null \
      | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null || true
  )"

  printf '%s\n' "$cert_text" | grep -Fq "$DOMAIN"
}

nginx_domain_is_configured() {
  nginx_dump="$(mktemp)"

  if ! nginx -T > "$nginx_dump" 2>&1; then
    cat "$nginx_dump" >&2
    rm -f "$nginx_dump"
    return 1
  fi

  if ! grep -Fq "server_name ${DOMAIN};" "$nginx_dump"; then
    rm -f "$nginx_dump"
    return 1
  fi

  if ! grep -Fq "proxy_pass http://127.0.0.1:${HOST_PORT};" "$nginx_dump"; then
    rm -f "$nginx_dump"
    return 1
  fi

  if truthy "${HTTPS:-false}"; then
    if ! grep -Fq "ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;" "$nginx_dump"; then
      rm -f "$nginx_dump"
      return 1
    fi

    if ! served_certificate_matches_domain; then
      rm -f "$nginx_dump"
      return 1
    fi
  fi

  rm -f "$nginx_dump"
  return 0
}

remove_conflicting_domain_configs() {
  for path in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* /etc/nginx/sites-available/* /etc/nginx/rtx5-managed/*.conf; do
    [ -e "$path" ] || continue
    [ "$path" = "$conf_file" ] && continue

    if grep -Fq "$DOMAIN" "$path"; then
      backup_path="$path.disabled.$(date +%s)"
      echo "Disabling conflicting nginx config for ${DOMAIN}: ${path} -> ${backup_path}"
      mv "$path" "$backup_path"
    fi
  done
}

configure_domain() {
  if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "null" ]; then
    return 0
  fi

  ensure_nginx

  managed_dir="/etc/nginx/rtx5-managed"
  challenge_root="/var/www/letsencrypt"
  cert_dir="/etc/letsencrypt/live/${DOMAIN}"
  conf_file="${managed_dir}/00-rtx-manager-${NAME}.conf"

  mkdir -p "$managed_dir" "$challenge_root"

  if nginx_domain_is_configured; then
    echo "Nginx already configured for ${DOMAIN}; skipping nginx/certbot setup."
    return 0
  fi

  ensure_managed_nginx_include
  remove_conflicting_domain_configs
  http_listen="$(nginx_listen_directives 80)"

  cat > "$conf_file" <<NGINX
server {
${http_listen}
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location ^~ /.well-known/acme-challenge/ {
        root ${challenge_root};
        default_type "text/plain";
    }

    location / {
        proxy_pass http://127.0.0.1:${HOST_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

  reload_nginx

  if truthy "${HTTPS:-false}"; then
    ensure_certbot

    if [ ! -f "${cert_dir}/fullchain.pem" ] || [ ! -f "${cert_dir}/privkey.pem" ]; then
      if [ -n "${CERTBOT_EMAIL:-}" ] && [ "$CERTBOT_EMAIL" != "null" ]; then
        certbot certonly --webroot -w "$challenge_root" -d "$DOMAIN" --non-interactive --agree-tos --email "$CERTBOT_EMAIL"
      else
        certbot certonly --webroot -w "$challenge_root" -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
      fi
    fi

    https_listen="$(nginx_listen_directives 443 " ssl http2")"

    cat > "$conf_file" <<NGINX
server {
${http_listen}
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${challenge_root};
        default_type "text/plain";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
${https_listen}
    server_name ${DOMAIN};

    ssl_certificate ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${HOST_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

    reload_nginx
  fi

  echo "RTX5 active nginx entries for ${DOMAIN}:"
  nginx -T 2>&1 | grep -n -A18 -B4 "${DOMAIN}" || true
}

configure_domain
