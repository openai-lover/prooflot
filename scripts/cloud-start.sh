#!/usr/bin/env bash
set -euo pipefail
cd /vercel/prooflot
exec 9>/tmp/prooflot-start.lock
flock -w 55 9
sudo bash scripts/cloud-cgroups.sh
if node scripts/cloud-health.mjs; then exit 0; fi
if ! sudo docker info >/dev/null 2>&1; then
  sudo rm -f /var/run/docker.pid
  sudo nohup dockerd --storage-driver=vfs >/tmp/prooflot-docker.log 2>&1 </dev/null 9>&- &
  for i in $(seq 1 40); do sudo docker info >/dev/null 2>&1 && break; sleep 1; done
  sudo docker info >/dev/null 2>&1
fi
sudo chown "$(id -u):$(id -g)" /var/run/docker.sock
sudo chmod 600 /var/run/docker.sock
nohup node scripts/start.mjs >/tmp/prooflot-server.log 2>&1 </dev/null 9>&- &
for i in $(seq 1 20); do node scripts/cloud-health.mjs && exit 0; sleep 1; done
exit 1
