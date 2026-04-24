#!/bin/bash

# ============================================================
# AI Content Repurposing Engine - Start Script
# ============================================================
# This script:
# 1. Kills processes on used ports
# 2. Sets up PostgreSQL database
# 3. Runs schema and seed data
# 4. Installs dependencies
# 5. Starts backend and frontend with hot reload
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${PURPLE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       🚀 AI Content Repurposing Engine                  ║"
echo "║       Starting Application...                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${RED}✗ .env file not found! Please create one.${NC}"
    exit 1
fi

BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

# ============================================================
# Step 1: Clean up used ports
# ============================================================
echo -e "\n${YELLOW}Step 1: Cleaning up ports...${NC}"

cleanup_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -e "  ${CYAN}Killing processes on port $port: $pids${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    else
        echo -e "  ${GREEN}Port $port is free${NC}"
    fi
}

cleanup_port $BACKEND_PORT
cleanup_port $FRONTEND_PORT

echo -e "${GREEN}✓ Ports cleaned${NC}"

# ============================================================
# Step 2: Check PostgreSQL
# ============================================================
echo -e "\n${YELLOW}Step 2: Checking PostgreSQL...${NC}"

if command -v psql &> /dev/null; then
    echo -e "  ${GREEN}PostgreSQL client found${NC}"
else
    echo -e "  ${RED}PostgreSQL client not found. Please install PostgreSQL.${NC}"
    exit 1
fi

# Check if PostgreSQL is running
if pg_isready -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} &> /dev/null; then
    echo -e "  ${GREEN}PostgreSQL is running${NC}"
else
    echo -e "  ${YELLOW}Starting PostgreSQL...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
    else
        sudo systemctl start postgresql 2>/dev/null || true
    fi
    sleep 2
fi

# ============================================================
# Step 3: Setup Database
# ============================================================
echo -e "\n${YELLOW}Step 3: Setting up database...${NC}"

DB_NAME=${DB_NAME:-content_engine}
DB_USER=${DB_USER:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

# Create database if it doesn't exist
echo -e "  ${CYAN}Creating database '${DB_NAME}' if not exists...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>/dev/null | grep -q 1 || \
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null

echo -e "  ${GREEN}✓ Database ready${NC}"

# Run schema
echo -e "  ${CYAN}Running schema...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/db/schema.sql 2>/dev/null || true
echo -e "  ${GREEN}✓ Schema applied${NC}"

# Run seed data
echo -e "  ${CYAN}Seeding data (15+ items per feature)...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/db/seed.sql 2>/dev/null || true
echo -e "  ${GREEN}✓ Seed data loaded${NC}"

# ============================================================
# Step 4: Install Dependencies
# ============================================================
echo -e "\n${YELLOW}Step 4: Installing dependencies...${NC}"

# Root dependencies
echo -e "  ${CYAN}Installing root dependencies...${NC}"
npm install --silent 2>/dev/null

# Backend dependencies
echo -e "  ${CYAN}Installing backend dependencies...${NC}"
cd backend
npm install --silent 2>/dev/null
cd ..

# Frontend dependencies
echo -e "  ${CYAN}Installing frontend dependencies...${NC}"
cd frontend
npm install --silent 2>/dev/null
cd ..

echo -e "${GREEN}✓ All dependencies installed${NC}"

# ============================================================
# Step 5: Start Application with Hot Reload
# ============================================================
echo -e "\n${YELLOW}Step 5: Starting application with hot reload...${NC}"
echo -e "${PURPLE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Backend:  http://localhost:${BACKEND_PORT}                        ║"
echo "║  Frontend: http://localhost:${FRONTEND_PORT}                        ║"
echo "║                                                          ║"
echo "║  Demo Login:                                             ║"
echo "║    Email:    admin@contentengine.com                     ║"
echo "║    Password: admin123                                    ║"
echo "║                                                          ║"
echo "║  Hot reload enabled - changes auto-refresh!              ║"
echo "║  Press Ctrl+C to stop all services                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Start backend with nodemon for hot reload, and frontend with react-scripts (built-in hot reload)
npx concurrently \
    --names "BACKEND,FRONTEND" \
    --prefix-colors "blue,green" \
    --kill-others \
    "cd backend && npx nodemon --watch . --ext js,json server.js" \
    "cd frontend && BROWSER=none PORT=${FRONTEND_PORT} npx react-scripts start"
