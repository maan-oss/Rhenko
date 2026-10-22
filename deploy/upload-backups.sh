#!/bin/sh
# Copies database dumps from /backups to the R2 bucket, under db-backups/, every UPLOAD_EVERY_SECONDS (default 3600).
# rclone copy adds only the dumps the bucket does not have yet. After each copy, dumps in the bucket older than
# BACKUP_KEEP_DAYS (default 30) are removed, so the 30-day limit does not depend on a rule set by hand in the Cloudflare
# dashboard. Only files matching rhenko-*.dump are touched.
set -eu

EVERY="${UPLOAD_EVERY_SECONDS:-3600}"
KEEP="${BACKUP_KEEP_DAYS:-30}"

while true; do
  rclone copy /backups "r2:${RHENKO_R2_BUCKET}/db-backups" --include "rhenko-*.dump" --transfers 2 --log-level NOTICE \
    || echo "upload to R2 failed; will try again in $EVERY seconds" >&2
  rclone delete "r2:${RHENKO_R2_BUCKET}/db-backups" --include "rhenko-*.dump" --min-age "${KEEP}d" --log-level NOTICE \
    || echo "removing dumps older than $KEEP days from R2 failed; will try again in $EVERY seconds" >&2
  sleep "$EVERY"
done
