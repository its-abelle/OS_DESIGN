#!/bin/sh
set -eu
attempt=0
until curl --fail --silent --max-time 2 http://127.0.0.1:8081/api/health >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'Apache/PHP did not become ready; inspect startup logs.' >&2
    exit 1
  fi
  sleep 1
done
exec nginx -g 'daemon off;'
