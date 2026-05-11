#!/usr/bin/with-contenv sh
set -e

mkdir -p "${APK_DIR:-/data/apks}"

cd /opt/app
exec node src/index.js
