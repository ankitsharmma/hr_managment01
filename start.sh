#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
node scripts/setup.mjs
npm ci
npm run build
npm start
