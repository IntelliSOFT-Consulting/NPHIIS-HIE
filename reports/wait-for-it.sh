#!/usr/bin/env bash

set -e

host="$1"
shift
port="$1"
shift
cmd="$@"

sleep 10

flask db upgrade

# flask db migrate -m "Initial migration"
# flask db revision --autogenerate -m "Create tables"

# flask db upgrade head

exec $cmd
