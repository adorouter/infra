#!/bin/sh
# Proves a backup can be restored without touching the running service: decrypts it,
# restores the database into a throwaway container, and compares row counts with live.
#
#   scripts/verify-restore.sh <backup.tar.age> <age-identity-file>
set -eu

backup="$1"
identity="$2"
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
box="adorouter-restore-check-$$"
trap 'docker rm -f "$box" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
age -d -i "$identity" "$backup" | tar -C "$work" -xf -
for f in .env gateway.env site.env db.dump; do
  [ -s "$work/$f" ] || { echo "backup is missing $f"; exit 1; }
done

docker run -d --name "$box" -e POSTGRES_USER=adorouter -e POSTGRES_PASSWORD=check -e POSTGRES_DB=adorouter \
  -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C" postgres:17-alpine >/dev/null
until docker exec "$box" pg_isready -q -U adorouter -d adorouter; do sleep 1; done
sleep 2
until docker exec "$box" pg_isready -q -U adorouter -d adorouter; do sleep 1; done
docker exec -i "$box" pg_restore -U adorouter -d adorouter --no-owner --exit-on-error < "$work/db.dump"

count='select (select count(*) from users)::text || '"'"' users, '"'"' || (select count(*) from tokens)::text || '"'"' keys, '"'"' || (select count(*) from channels)::text || '"'"' channels'"'"
echo "restored: $(docker exec "$box" psql -U adorouter -d adorouter -Atc "$count")"
echo "live:     $(docker compose exec -T postgres psql -U adorouter -d adorouter -Atc "$count")"
echo "The counts should match, apart from anything created since the backup."
