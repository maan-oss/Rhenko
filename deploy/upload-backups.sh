#!/bin/sh
# Copies database dumps from /backups to the R2 bucket, under db-backups/, every UPLOAD_EVERY_SECONDS (default 3600).
# rclone copies only the files the bucket does not have yet, and it never deletes from the bucket. Old dumps are removed
# by a lifecycle rule on the db-backups/ prefix (see the README).
set -eu

EVERY="${UPLOAD_EVERY_SECONDS:-3600}"

while true; do
  rclone copy /backups "r2:${RHENKO_R2_BUCKET}/db-backups" --include "rhenko-*.dump" --transfers 2 --log-level NOTICE \
    || echo "upload to R2 failed; will try again in $EVERY seconds" >&2
  sleep "$EVERY"
done
