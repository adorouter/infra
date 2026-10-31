#!/bin/sh
# Starts a throwaway gateway, runs the promises test against it, removes everything.
# GATEWAY_IMAGE picks the image; by default build one from a checkout with
#   docker build -t adorouter-gateway:test ../new-api
set -u
cd "$(dirname "$0")"
docker compose -f compose.promises.yml up --abort-on-container-exit --exit-code-from tester --attach tester
status=$?
docker compose -f compose.promises.yml down -v --remove-orphans
exit "$status"
