#!/usr/bin/env bash
set -euo pipefail
# Run from the extracted release directory. Installs files; never starts the app.
[[ $(id -u) == 0 ]] || { echo 'Run with sudo bash deploy/install.sh'; exit 1; }
[[ ! -e /etc/pieona/deploy.json ]] || { echo 'This server uses CI/CD. Deploy through GitHub Actions; do not replace its service with the legacy installer.'; exit 1; }
cd "$(dirname "$0")/.."
[[ -f dist/index.html && -f server/index.mjs ]] || { echo 'Incomplete release'; exit 1; }
[[ -x /usr/bin/node ]] || { echo 'Install Node.js 22.13+ at /usr/bin/node first'; exit 1; }
/usr/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<13))process.exit(1); const db=new DatabaseSync(":memory:"); db.close();'
if systemctl is-active --quiet pieona; then
  echo 'Stop pieona and back up its database before replacing application files.'; exit 1
fi
id pieona >/dev/null 2>&1 || useradd --system --home-dir /var/lib/pieona --shell /usr/sbin/nologin pieona
install -d -m 755 /opt/pieona/app /etc/pieona
install -d -o pieona -g pieona -m 700 /var/lib/pieona
[[ ! -e /opt/pieona/app/.env ]] || { echo 'Remove legacy app/.env after safely migrating its settings; it overrides Gemini configuration.'; exit 1; }
cp -a package.json package-lock.json server shared dist resource deploy /opt/pieona/app/
cd /opt/pieona/app
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
chown -R root:root /opt/pieona/app
chmod -R go-w /opt/pieona/app
if [[ ! -e /etc/pieona/pieona.env ]]; then
  install -m 600 deploy/oracle.env.example /etc/pieona/pieona.env
fi
install -m 644 deploy/pieona.service /etc/systemd/system/pieona.service
systemctl daemon-reload
echo 'Installed. Configure /etc/pieona/pieona.env, import database, configure Caddy, then enable/start pieona.'
