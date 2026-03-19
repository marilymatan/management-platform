#!/bin/sh
set -e
chown -R app:app /data/uploads 2>/dev/null || true
exec su-exec app node dist/index.js
