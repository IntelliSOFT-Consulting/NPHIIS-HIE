#!/usr/bin/env bash

set -e

host="$1"
shift
port="$1"
shift
cmd="$@"

sleep 10

exec $cmd
