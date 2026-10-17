#!/bin/sh
# Runs the bootstrap checks in a privileged Ubuntu 24.04 container. See bootstrap-inside.sh for what is checked and what is
# stood in for. Needs Docker and network access to the Ubuntu package archive.
#
#   sh deploy/test/bootstrap-test.sh
set -eu
repo=$(cd "$(dirname "$0")/../.." && pwd)
exec docker run --rm --privileged -v "$repo":/src:ro ubuntu:24.04 sh /src/deploy/test/bootstrap-inside.sh
