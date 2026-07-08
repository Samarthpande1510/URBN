#!/usr/bin/env bash
# URBN one-shot server setup — run on a fresh Ubuntu 24.04 box as the `samarth` user.
# Usage: bash ~/URBN/deploy/setup.sh
# Prereq: repo already cloned to ~/URBN and the two .env files created (see PROMPTS below).
set -euo pipefail

REPO=~/URBN
DB_NAME=urbn_db
DB_USER=urbn
DB_PASS=urbn

echo "==> 1/8  System packages"
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl tmux nginx postgresql postgresql-contrib \
                        python3 python3-venv python3-pip

echo "==> 2/8  Node.js 20"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> 3/8  uv (Python package manager)"
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

echo "==> 4/8  Postgres role + database"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "==> 5/8  Backend deps + schema"
cd "$REPO/backend"
[ -f .env ] || { echo "!! MISSING backend/.env — create it first (DATABASE_URL, SECRET_KEY, RESEND_API_KEY, R2_*)"; exit 1; }
uv sync
# Build schema directly from models.py — the source of truth. No migration drift.
uv run python -c "from database import _engine, Base; import models; Base.metadata.create_all(bind=_engine); print('schema OK')"
uv run alembic stamp head

echo "==> 6/8  Frontend build"
cd "$REPO/frontend"
[ -f .env.local ] || { echo "!! MISSING frontend/.env.local — create it first (NEXT_PUBLIC_API_URL)"; exit 1; }
npm install
npm run build

echo "==> 7/8  systemd services"
sudo cp "$REPO/deploy/urbn-backend.service" /etc/systemd/system/
sudo cp "$REPO/deploy/urbn-frontend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now urbn-backend urbn-frontend

echo "==> 8/8  Firewall"
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw allow 8000
sudo ufw --force enable

echo ""
echo "✅ Done. Backend :8000, Frontend :3000, both running under systemd."
echo "   Logs:  sudo journalctl -u urbn-backend -f"
echo "   Logs:  sudo journalctl -u urbn-frontend -f"
