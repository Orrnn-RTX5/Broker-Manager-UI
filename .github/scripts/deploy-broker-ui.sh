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

configure_domain() {
  if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "null" ]; then
    return 0
  fi

  ensure_nginx

  conf_file="/etc/nginx/conf.d/rtx-manager-${NAME}.conf"
  cat > "$conf_file" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

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

  if truthy "${HTTPS:-false}"; then
    ensure_certbot

    if [ -n "${CERTBOT_EMAIL:-}" ] && [ "$CERTBOT_EMAIL" != "null" ]; then
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --email "$CERTBOT_EMAIL"
    else
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email
    fi
  fi
}

configure_domain
