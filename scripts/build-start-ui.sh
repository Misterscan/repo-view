#!/usr/bin/env bash
# Safe helper to build the React+Vite app for production on Mac/Linux

# Get directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

# Function to handle errors and keep window open
fail() {
    echo ""
    echo "------------------------------------------------"
    echo "ERROR: $1"
    echo "The script will stay open so you can read the error above."
    echo "Press any key to close this window..."
    read -n 1 -s
    exit 1
}

# Check for node/npm
if ! command -v node >/dev/null 2>&1; then
    fail "node is not installed or not in PATH. Please install Node.js from https://nodejs.org/"
fi

# Detect package manager
PM="npm"
if [ -f "package-lock.json" ]; then
    PM="npm"
elif [ -f "pnpm-lock.yaml" ]; then
    PM="pnpm"
elif [ -f "yarn.lock" ]; then
    PM="yarn"
fi

# Ensure PM is installed
if ! command -v $PM >/dev/null 2>&1; then
    fail "$PM is not installed or not in PATH."
fi

echo "Using package manager: $PM"

if [ ! -d "node_modules" ]; then
    echo "node_modules not found — running install with $PM..."
    $PM install || fail "Dependency installation failed."
fi

echo "Linting code: $PM run lint"
$PM run lint || fail "Linting failed."

echo "Building production assets: $PM run build"
$PM run build || fail "Build failed."

echo "Starting production server: $PM run start"

# Open browser shortly after starting prod server in background
if command -v open >/dev/null 2>&1; then
    (sleep 2 && open http://localhost:3000) &
fi

export REPOVIEW_VERBOSE=1
$PM run start || fail "Production server failed to start."
