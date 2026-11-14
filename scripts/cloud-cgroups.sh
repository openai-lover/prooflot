#!/usr/bin/env bash
set -euo pipefail
# Prepare a domain hierarchy inside this dedicated VM. Container memory and
# CPU limits require domain cgroups, not the image's initial threaded layout.
root=/sys/fs/cgroup
if [ "$(cat "$root/cgroup.type")" = 'domain threaded' ]; then
  if find "$root" -mindepth 1 -maxdepth 1 -type d | read -r unused; then
    echo 'Unexpected cgroup children; refusing to alter the hierarchy.' >&2
    exit 1
  fi
  controls=$(cat "$root/cgroup.subtree_control")
  for control in $controls; do printf -- '-%s\n' "$control" > "$root/cgroup.subtree_control"; done
  [ "$(cat "$root/cgroup.type")" = domain ]
fi
[ "$(cat "$root/cgroup.type")" = domain ]
mkdir -p "$root/prooflot-host"
# Snapshot PID membership before migrating it; reading the changing file while
# moving processes can skip entries and leave controllers unable to start.
for attempt in 1 2 3; do
  mapfile -t members < "$root/cgroup.procs"
  if [ "${#members[@]}" -eq 0 ]; then break; fi
  for pid in "${members[@]}"; do
    if [ -d "/proc/$pid" ]; then printf '%s\n' "$pid" > "$root/prooflot-host/cgroup.procs"; fi
  done
done
printf '+cpu +cpuset +memory +pids +io\n' > "$root/cgroup.subtree_control"
for control in cpu memory pids; do
  grep -qw "$control" "$root/cgroup.subtree_control"
done
