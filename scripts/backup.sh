#!/bin/sh
# Encrypts a Postgres dump and the env files, and sends them off the server.
# Run nightly from cron. Exits non-zero on any failure, so cron can report it.
set -eu

cd "$(dirname "$0")/.."
set -a
. ./.env
set +a

name="adorouter-$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
sealed="$(mktemp)"
trap 'rm -rf "$work" "$sealed"' EXIT

docker compose exec -T postgres pg_dump -U adorouter -d adorouter --format=custom > "$work/db.dump"
# The keys in gateway.env decrypt everything in the dump, so restoring needs both.
cp .env gateway.env site.env "$work/"
tar -C "$work" -cf - . > "$work.tar"
age -r "$BACKUP_AGE_RECIPIENT" -o "$sealed" "$work.tar"
rm -f "$work.tar"

# The checksum settings keep newer AWS CLIs compatible with Cloudflare R2.
docker run --rm -i -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  amazon/aws-cli:2.27.50 --endpoint-url "$BACKUP_S3_ENDPOINT" \
  s3 cp --no-progress - "s3://$BACKUP_S3_BUCKET/$name.tar.age" < "$sealed"
echo "backup uploaded: $name"
