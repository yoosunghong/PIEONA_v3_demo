#!/usr/bin/env bash
set -euo pipefail
umask 022
exec /usr/bin/flock -n /opt/pieona/.deploy.lock /opt/pieona/runtime/bin/node /usr/local/libexec/pieona-release-manager.mjs
