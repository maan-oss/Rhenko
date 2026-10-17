#!/bin/sh
# First-time setup of a new Ubuntu server for Rhenko. Run it once, as root, from a clone of the repository:
#
#   git clone https://github.com/maan-oss/Rhenko.git rhenko && cd rhenko
#   sudo sh deploy/bootstrap.sh
#
# It installs Docker from Docker's own repository, opens the firewall to SSH, HTTP and HTTPS only, adds a 2 GB swap file so
# the image build does not run out of memory on a 4 GB server, and turns on automatic security updates. Then it asks for
# the domain and the Cloudflare R2 settings, writes .env with new random passwords and server key (generated here and never
# printed), and starts the stack. The secret key is typed without being shown. Each step is skipped when it is already done,
# so the script can be run again.
set -eu

die() {
  echo "error: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run it as root: sudo sh deploy/bootstrap.sh"
[ -f docker-compose.yml ] && [ -f deploy/Caddyfile ] || die "run it from the root of the Rhenko repository"

# shellcheck source=/dev/null
. /etc/os-release
[ "$ID" = "ubuntu" ] || die "this script is written for Ubuntu (found: $ID)"

export DEBIAN_FRONTEND=noninteractive
trap 'stty echo 2>/dev/null || true; rm -f .env.partial' EXIT

mem_kb=$(awk '/MemTotal/ { print $2 }' /proc/meminfo)
if [ "$mem_kb" -lt 3500000 ]; then
  echo "warning: this server has less than 4 GB of memory. The database settings in docker-compose.yml assume 4 GB." >&2
fi

# 1. Docker Engine and the Compose plugin, from Docker's own repository.
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl openssl >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1

# 2. Swap, for the image build.
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ ! -e /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3. Firewall. Only SSH, HTTP and HTTPS are open. Docker publishes ports past ufw, so the only ports published by
# docker-compose.yml are 80 and 443 (through Caddy). The database and the app are on the internal network only.
apt-get install -y -qq ufw >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

# 4. Security updates install themselves.
apt-get install -y -qq unattended-upgrades >/dev/null

# 5. Settings. The passwords and the server key are generated on this server and written only to .env.
if [ ! -f .env ]; then
  umask 077
  # The answers are written to .env.partial and it becomes .env only when every answer is accepted. A refused answer then
  # leaves nothing behind, so the next run asks again instead of finding a half-written .env.
  cp .env.example .env.partial

  printf 'Domain people will use, for example rhenko.example.com: '
  read -r domain
  case "$domain" in
    ''|*' '*) die "the domain is empty or has a space in it" ;;
  esac

  printf 'R2 S3 endpoint, https://<account-id>.r2.cloudflarestorage.com: '
  read -r r2_endpoint
  case "$r2_endpoint" in
    https://*) ;;
    *) die "the R2 endpoint must start with https://" ;;
  esac

  printf 'R2 bucket name [rhenko-media]: '
  read -r r2_bucket
  r2_bucket=${r2_bucket:-rhenko-media}

  printf 'R2 access key ID: '
  read -r r2_key
  [ -n "$r2_key" ] || die "the R2 access key ID is empty"

  printf 'R2 secret access key (typed hidden): '
  stty -echo 2>/dev/null || true
  read -r r2_secret
  stty echo 2>/dev/null || true
  echo
  [ -n "$r2_secret" ] || die "the R2 secret access key is empty"

  cat >> .env.partial <<EOF

# Written by deploy/bootstrap.sh.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
RHENKO_SECRET=$(openssl rand -hex 24)
RHENKO_DOMAIN=$domain
RHENKO_PUBLIC_URL=https://$domain
RHENKO_R2_ENDPOINT=$r2_endpoint
RHENKO_R2_BUCKET=$r2_bucket
RHENKO_R2_ACCESS_KEY_ID=$r2_key
RHENKO_R2_SECRET_ACCESS_KEY=$r2_secret
EOF
  chmod 600 .env.partial
  mv .env.partial .env
  echo ".env written. The passwords and the server key were generated on this server."
else
  echo ".env already exists, so it is kept as it is."
fi

domain=$(sed -n 's/^RHENKO_DOMAIN=//p' .env | tail -n 1)
[ -n "$domain" ] || die "RHENKO_DOMAIN is not set in .env"

# 6. Start the stack, and wait until the app answers its health check.
docker compose config --quiet || die "the settings in .env are not valid"
docker compose up -d --build

attempts=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null)" = "healthy" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 60 ] || die "the app did not become healthy. Read the log with: docker compose logs app"
  sleep 5
done

echo
echo "Rhenko is running on this server. Point the DNS record for $domain at this server's address."
echo "HTTPS starts once that record resolves; Caddy fetches the certificate then."
echo "Useful next steps: docker compose ps, docker compose logs -f app, docker compose exec backup sh /backup.sh once"
