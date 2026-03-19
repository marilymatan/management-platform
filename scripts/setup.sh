#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

cd "$(dirname "$0")/.."

info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
command -v pnpm >/dev/null 2>&1   || error "pnpm is not installed. Install it with: npm install -g pnpm"

if ! docker info >/dev/null 2>&1; then
  error "Docker daemon is not running. Start Docker Desktop and try again."
fi

if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env
  warn "Edit .env and fill in your Google OAuth and LLM API keys."
else
  info ".env already exists, skipping."
fi

info "Starting PostgreSQL via Docker Compose..."
docker compose up -d

info "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    info "PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "PostgreSQL did not become ready in time."
  fi
  sleep 1
done

info "Installing dependencies..."
pnpm install

info "Running database migrations..."
pnpm db:push

info "Creating uploads directory..."
mkdir -p data/uploads

info "Setup complete!"
echo ""
echo "  Start the dev server:   pnpm dev"
echo "  Run unit tests:         pnpm test"
echo "  Run E2E tests:          pnpm test:e2e"
echo ""
warn "Remember to fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and LLM_API_KEY in .env"
