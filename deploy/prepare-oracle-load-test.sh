#!/usr/bin/env bash
# Installs an isolated Node runtime and the test app, without changing system services.
set -euo pipefail
task_root="$HOME/illova-load-test-20261024"
archive="${1:?Path to oracle-load-runtime.tar.gz required}"
mkdir -p "$task_root/tools" "$task_root/app" "$task_root/runs"
cd "$task_root/tools"
curl -fsSL --max-time 60 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
node_archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
[[ "$node_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64.tar.xz$ ]] || { echo 'Unexpected Node manifest'; exit 1; }
curl -fsSL --max-time 180 "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$node_archive"
grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -
tar -xJf "$node_archive"
export PATH="$task_root/tools/${node_archive%.tar.xz}/bin:$PATH"
node --version
tar -xzf "$archive" -C "$task_root/app"
cd "$task_root/app"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
printf '%s\n' "export PATH=$task_root/tools/${node_archive%.tar.xz}/bin:\$PATH" > "$task_root/node-path.sh"
echo "Prepared isolated test app: $task_root/app"
