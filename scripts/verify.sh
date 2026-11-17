#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose config --quiet
docker compose exec -T backend sh -c 'find /var/www/app/src /var/www/app/scripts /var/www/html -name "*.php" -print0 | xargs -0 -n1 php -l'
docker compose exec -T backend composer validate --no-check-publish
docker compose exec -T backend apache2ctl -t
docker compose exec -T frontend nginx -t
python3 backend/tests/integration.py
