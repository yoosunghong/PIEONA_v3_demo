#!/usr/bin/env bash
# Run only on a recovery host with the original Ubuntu root partition mounted.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Root required'; exit 1; }
root=$(realpath "${1:?Mounted Ubuntu root required}")
key=$(realpath "${2:?Public key file required}")
expected_uuid=${3:?Expected original root filesystem UUID required}
mode=${4:---inspect}
[[ "$root" == /mnt/illova-recovery ]] || { echo 'Unexpected mount path'; exit 1; }
mountpoint -q "$root" || { echo 'Not a mount point'; exit 1; }
[[ $(findmnt -n -o UUID --target "$root") == "$expected_uuid" ]] || { echo 'Wrong filesystem UUID'; exit 1; }
grep -q '^ID=ubuntu$' "$root/etc/os-release" || { echo 'Not Ubuntu'; exit 1; }
grep '^ubuntu:' "$root/etc/passwd"
home="$root/home/ubuntu"
keys="$home/.ssh/authorized_keys"
[[ -d "$home" && ! -L "$home" && ! -L "$home/.ssh" && ! -L "$keys" ]] || { echo 'Unexpected home or symlink; inspect manually'; exit 1; }
[[ $(ssh-keygen -lf "$key" | awk '{print $2}') == SHA256:WXpdHZZYq93sKAWmKEjjo2fHWBAo0GPERyom9+JIjAg ]] || { echo 'Not the approved illova_oracle public key'; exit 1; }
stat -c '%u:%g %a %n' "$home" "$home/.ssh" "$keys" 2>/dev/null || true
if [[ -f "$keys" ]]; then ssh-keygen -lf "$keys" || true; fi
if [[ "$mode" != --apply ]]; then echo 'Inspection only; nothing changed'; exit 0; fi
[[ $(findmnt -n -o OPTIONS --target "$root") == *rw* ]] || { echo 'Filesystem must be read-write for repair'; exit 1; }
mkdir -p "$home/.ssh"
backup="$keys.before-illova-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "$backup" ]] || { echo 'Backup already exists'; exit 1; }
if [[ -f "$keys" ]]; then cp -a "$keys" "$backup"; echo "Original keys saved: $backup"; else touch "$keys"; fi
public_blob=$(awk 'NR==1{print $2}' "$key")
if ! awk '{print $2}' "$keys" | grep -Fqx -- "$public_blob"; then
  printf '\n' >> "$keys"
  cat "$key" >> "$keys"
  printf '\n' >> "$keys"
fi
chown --reference="$home" "$home/.ssh" "$keys"
chmod go-w "$home"
chmod 700 "$home/.ssh"
chmod 600 "$keys"
sync
ssh-keygen -lf "$keys"
echo 'Approved key and permissions repaired; existing keys preserved.'
