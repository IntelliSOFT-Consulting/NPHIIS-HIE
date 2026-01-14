#!/usr/bin/env python3
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
"""
Permanently fix python-openid package for Python 3.11 compatibility.

This script applies all necessary fixes to make the python-openid package
(from 2010, written for Python 2) work with Python 3.11.
"""

import os
import re
import sys
from pathlib import Path


def fix_file(filepath: Path) -> bool:
    """Apply all Python 3.11 compatibility fixes to a Python file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Warning: Could not read {filepath}: {e}", file=sys.stderr)
        return False

    original_content = content

    # Fix 1: Python 2 module imports
    content = re.sub(r'^import urlparse$', 'import urllib.parse as urlparse', content, flags=re.MULTILINE)
    content = re.sub(r'^from urlparse import', 'from urllib.parse import', content, flags=re.MULTILINE)
    content = re.sub(r'^from urllib import urlencode$', 'from urllib.parse import urlencode', content, flags=re.MULTILINE)

    # Fix 2: Octal literals
    content = re.sub(r', 0600\)', ', 0o600)', content)
    content = re.sub(r', 0200\)', ', 0o200)', content)
    content = re.sub(r', 0400\)', ', 0o400)', content)
    content = re.sub(r', 0644\)', ', 0o644)', content)
    content = re.sub(r'\( 0600\)', '( 0o600)', content)
    content = re.sub(r'\( 0200\)', '( 0o200)', content)

    # Fix 3: Python 2 exception syntax (simple cases)
    exceptions = [
        'OSError', 'IOError', 'ValueError', 'XMLError', 'XRDSError',
        'HTMLParseError', 'ParseDone', 'ProtocolError', 'DiscoveryFailure',
        'ServerError', 'SetupNeededError', 'KeyError', 'binascii.Error'
    ]
    for exc in exceptions:
        # Match: except Exception, var:
        content = re.sub(
            rf'except {re.escape(exc)}, (\w+):',
            rf'except {exc} as \1:',
            content
        )
    # Special case for fetchers.HTTPFetchingError
    content = re.sub(
        r'except fetchers\.HTTPFetchingError, (\w+):',
        r'except fetchers.HTTPFetchingError as \1:',
        content
    )

    # Fix 4: Parenthesized exception syntax
    content = re.sub(
        r'except \(ProtocolError, DiscoveryFailure\), (\w+):',
        r'except (ProtocolError, DiscoveryFailure) as \1:',
        content
    )
    content = re.sub(
        r'except \(fetchers\.HTTPFetchingError, ServerError\), (\w+):',
        r'except (fetchers.HTTPFetchingError, ServerError) as \1:',
        content
    )

    # Fix 5: Python 2 long integer literals (remove L suffix)
    content = re.sub(r'(\d+)L\b', r'\1', content)

    # Fix 6: Python 2 lambda parameter syntax (remove parentheses)
    # Match: lambda (a, b): -> lambda a, b:
    content = re.sub(r'lambda \((\w+(?:, \w+)*)\):', r'lambda \1:', content)

    # Fix 7: version_info map issue (convert map to list)
    # This is file-specific, so we'll check the filename
    if filepath.name == '__init__.py':
        content = re.sub(
            r'version_info = map\(int, __version__\.split\([\'"]\.[\'"]\)\)',
            'version_info = list(map(int, __version__.split(\'.\')))',
            content
        )

    # Only write if content changed
    if content != original_content:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error: Could not write {filepath}: {e}", file=sys.stderr)
            return False

    return False


def main():
    """Main function to fix all Python files in the openid package."""
    if len(sys.argv) > 1:
        openid_dir = Path(sys.argv[1])
    else:
        # Default location
        python_version = f"{sys.version_info.major}.{sys.version_info.minor}"
        openid_dir = Path(f"/app/.venv/lib/python{python_version}/site-packages/openid")

    if not openid_dir.exists():
        print(f"OpenID directory not found: {openid_dir}", file=sys.stderr)
        sys.exit(0)  # Not an error if package isn't installed

    if not openid_dir.is_dir():
        print(f"Path is not a directory: {openid_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Applying Python 3.11 compatibility fixes to {openid_dir}...")

    # Find all Python files
    python_files = list(openid_dir.rglob('*.py'))
    
    if not python_files:
        print(f"No Python files found in {openid_dir}", file=sys.stderr)
        sys.exit(0)

    fixed_count = 0
    for py_file in python_files:
        if fix_file(py_file):
            fixed_count += 1
            print(f"Fixed: {py_file.relative_to(openid_dir.parent.parent.parent)}")

    print(f"Applied fixes to {fixed_count} file(s).")
    sys.exit(0)


if __name__ == '__main__':
    main()
