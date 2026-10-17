#!/bin/sh
# Writes a dump of the database into /backups every BACKUP_EVERY_SECONDS (default 21600, six hours) and keeps the newest
# BACKUP_KEEP dumps (default 16, which is four days at that rate). The backup-upload service copies them to R2.
#
#   sh /backup.sh once     write one dump and exit (docker compose exec backup sh /backup.sh once)
#
# A dump is written under a .partial name and renamed only when it is complete, so an upload never picks up half a file.
# Older dumps are removed only after a new one has been written.
set -eu

EVERY="${BACKUP_EVERY_SECONDS:-21600}"
KEEP="${BACKUP_KEEP:-16}"

dump() {
  name="/backups/rhenko-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --compress=9 --no-owner --file "$name.partial" && mv "$name.partial" "$name"; then
    echo "wrote $name"
  else
    rm -f "$name.partial"
    echo "database dump failed" >&2
    return 1
  fi
  ls -1t /backups/rhenko-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
}

if [ "${1:-}" = "once" ]; then
  dump
  exit $?
fi

while true; do
  dump || echo "will try again in $EVERY seconds" >&2
  sleep "$EVERY"
done
