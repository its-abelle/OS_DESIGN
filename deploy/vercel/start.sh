#!/bin/bash
set -eu
export PUBLIC_PORT="${PORT:-80}"
export NGINX_MAX_BODY_BYTES=4456448
envsubst '${PUBLIC_PORT} ${NGINX_MAX_BODY_BYTES}' < /deploy/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t
apache2ctl -t
children=""
shutdown() {
  trap - INT TERM
  for child in $children; do kill -TERM "$child" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap 'shutdown; exit 0' INT TERM
/var/www/app/scripts/start.sh &
children="$!"
php /var/www/app/scripts/cleanup.php --loop &
children="$children $!"
/deploy/start-nginx.sh &
children="$children $!"
status=0
wait -n || status=$?
shutdown
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
