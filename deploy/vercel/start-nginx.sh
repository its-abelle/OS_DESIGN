#!/bin/sh
set -eu
# Don't expose the public port until Apache and the database-checked API are ready.
node /deploy/wait-ready.mjs
exec nginx -g 'daemon off;'
