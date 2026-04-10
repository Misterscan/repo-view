#!/usr/bin/env bash
# Safe helper to start the React+Vite app for production on Mac/Linux
# - Assumes production assets are already built (run build-start-ui.sh first)

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
    fail "node is not installed or not in PATH."
fi

echo "Starting production server: npm run start"

# Open browser shortly after starting prod server in background
if command -v open >/dev/null 2>&1; then
    (sleep 2 && open http://localhost:3000) &
fi

export REPOVIEW_VERBOSE=1
npm run start || fail "Server failed to start."
