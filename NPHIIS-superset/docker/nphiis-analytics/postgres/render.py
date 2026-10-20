"""Expands '-- @include <file>' lines in the Postgres dataset SQL (one level per include,
recursively), so a dataset can embed another's query without a database view."""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def render(name):
    with open(os.path.join(HERE, name)) as f:
        sql = f.read()
    return re.sub(r"^-- @include (\S+)\s*$", lambda m: render(m.group(1)).rstrip(), sql, flags=re.M).rstrip().rstrip(";") + "\n"


if __name__ == "__main__":
    sys.stdout.write(render(sys.argv[1]))
