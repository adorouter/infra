#!/bin/sh
# Restores a backup into the database of this Compose project. Stops the gateway first
# and replaces everything in the database, so it asks before doing anything.
#
#   scripts/restore.sh <backup.tar.age> <age-identity-file>
set -eu

backup="$1"
identity="$2"
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
age -d -i "$identity" "$backup" | tar -C "$work" -xf -

printf 'This replaces the database of project "%s". Type RESTORE to continue: ' "$(basename "$PWD")"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "stopped"; exit 1; }

docker compose stop gateway site
docker compose exec -T postgres dropdb -U adorouter --if-exists adorouter
docker compose exec -T postgres createdb -U adorouter -T template0 -E UTF8 --locale=C adorouter
docker compose exec -T postgres pg_restore -U adorouter -d adorouter --no-owner < "$work/db.dump"
docker compose start gateway site
echo "restored. The env files from this backup are not applied: compare them with $backup if the keys differ."
