#!/bin/bash
# start.sh — Starts the backend server for PaginateDB demo
# Usage: ./start.sh

echo "🚀 Starting PaginateDB Backend..."
cd "$(dirname "$0")/backend"
node server.js
