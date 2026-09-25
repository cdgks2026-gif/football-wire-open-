#!/bin/sh
set -e
if [ "${TRAFILATURA_EMBEDDED:-1}" = "1" ]; then
  EXTRACTOR_PORT="${EXTRACTOR_PORT:-8091}" python3 /app/extractor/app.py >/tmp/trafilatura.log 2>&1 &
fi
exec npm start
