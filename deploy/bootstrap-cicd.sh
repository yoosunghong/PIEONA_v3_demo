#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
public_key=$(realpath "${1:?Deployment public key file required}")
node_source=$(realpath "${2:?Verified Node 24 directory required}")
script_root=$(cd "$(dirname "$0")" && pwd)
"$node_source/bin/node" --input-type=module -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1);import {DatabaseSync} from "node:sqlite";new DatabaseSync(":memory:").close()'
ssh-keygen -lf "$public_key"
id pieona >/dev/null 2>&1 || useradd --system --home-dir /var/lib/pieona --shell /usr/sbin/nologin pieona
id pieona-deploy >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/pieona-deploy --shell /bin/bash pieona-deploy
install -d -m 755 /opt/pieona /opt/pieona/releases /opt/pieona/incoming /etc/pieona /usr/local/libexec
chown pieona-deploy:pieona-deploy /opt/pieona /opt/pieona/releases /opt/pieona/incoming
if [[ ! -d /opt/pieona/runtime ]]; then cp -a "$node_source" /opt/pieona/runtime; fi
chown -R root:root /opt/pieona/runtime
chmod -R go-w /opt/pieona/runtime
install -d -o pieona -g pieona -m 700 /var/lib/pieona /var/lib/pieona/backups
install -m 644 "$script_root/release-manager.mjs" /usr/local/libexec/pieona-release-manager.mjs
install -m 644 "$script_root/extract-release.py" /usr/local/libexec/extract-release.py
install -m 644 "$script_root/db-admin.mjs" /usr/local/libexec/pieona-db-admin.mjs
install -m 755 "$script_root/gateway.sh" /usr/local/libexec/pieona-deploy-gateway
install -m 644 "$script_root/pieona-cicd.service" /etc/systemd/system/pieona.service
cat > /etc/pieona/deploy.json <<'JSON'
{"root":"/opt/pieona","node":"/opt/pieona/runtime/bin/node","npm":"/opt/pieona/runtime/bin/npm","python":"/usr/bin/python3","extractor":"/usr/local/libexec/extract-release.py","service":"pieona","healthUrl":"http://127.0.0.1:3000/api/health"}
JSON
chmod 644 /etc/pieona/deploy.json
install -d -o pieona-deploy -g pieona-deploy -m 700 /home/pieona-deploy/.ssh
auth=/home/pieona-deploy/.ssh/authorized_keys
if ! grep -Fq "$(awk '{print $2}' "$public_key")" "$auth" 2>/dev/null; then
  printf 'restrict,command="/usr/local/libexec/pieona-deploy-gateway" ' >> "$auth"
  cat "$public_key" >> "$auth"
  printf '\n' >> "$auth"
fi
chown pieona-deploy:pieona-deploy "$auth"
chmod 600 "$auth"
cat > /etc/sudoers.d/pieona-deploy <<'SUDO'
pieona-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl start pieona, /usr/bin/systemctl stop pieona
pieona-deploy ALL=(pieona) NOPASSWD: /opt/pieona/runtime/bin/node /usr/local/libexec/pieona-db-admin.mjs backup *, /opt/pieona/runtime/bin/node /usr/local/libexec/pieona-db-admin.mjs restore *
SUDO
chmod 440 /etc/sudoers.d/pieona-deploy
visudo -cf /etc/sudoers.d/pieona-deploy
systemctl daemon-reload
echo 'Bootstrap complete. Provision /etc/pieona/pieona.env (600) and DB before first production deployment.'
