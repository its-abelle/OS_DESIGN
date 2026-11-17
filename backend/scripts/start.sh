#!/bin/sh
set -eu

case "${MAX_UPLOAD_MB:-10}" in
  ''|*[!0-9]*) echo 'MAX_UPLOAD_MB must be an integer from 1 to 100' >&2; exit 1 ;;
esac
upload_mb="${MAX_UPLOAD_MB:-10}"
if [ "$upload_mb" -lt 1 ] || [ "$upload_mb" -gt 100 ]; then
  echo 'MAX_UPLOAD_MB must be an integer from 1 to 100' >&2
  exit 1
fi
cat > /usr/local/etc/php/conf.d/uploads.ini <<EOF
upload_max_filesize=${upload_mb}M
post_max_size=$((upload_mb + 1))M
max_file_uploads=1
memory_limit=256M
display_errors=Off
log_errors=On
expose_php=Off
date.timezone=UTC
EOF

# Only check existing tables. Schema creation is an explicit setup operation.
php /var/www/app/scripts/ready.php
exec apache2-foreground
