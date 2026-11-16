#!/bin/sh
set -eu

export PUBLIC_PORT="${PORT:-80}"
export MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-4}"
# The API also clamps to this ceiling. The extra 256 KB permits multipart headers
# while keeping the total below Vercel's 4.5 MB function request limit.
export NGINX_MAX_BODY_BYTES=4456448
envsubst '${PUBLIC_PORT} ${NGINX_MAX_BODY_BYTES}' < /deploy/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t
httpd -t

# PID 1 forwards shutdown signals and stops the image if any HTTP service exits.
# Apache and Nginx drop their worker privileges; Express runs as the node user.
children=""
shutdown() {
  trap - INT TERM
  for child in $children; do kill -TERM "$child" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap 'shutdown; exit 0' INT TERM
PORT=3000 su-exec node node src/index.ts &
children="$!"
httpd -D FOREGROUND -f /etc/apache2/httpd.conf &
children="$children $!"
/deploy/start-nginx.sh &
children="$children $!"
status=0
wait -n || status=$?
shutdown
# A server exiting successfully is still unexpected while the image is serving.
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
