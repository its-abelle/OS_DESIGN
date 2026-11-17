#!/usr/bin/env python3
"""Export accounts and file metadata BEFORE replacing the old database container."""
import json
import os
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 3:
    sys.exit('Usage: python3 scripts/export-postgres.py OLD_CONTAINER PRIVATE_OUTPUT.json')
container, destination = sys.argv[1:]
sql = """SELECT json_build_object(
  'users', COALESCE((SELECT json_agg(u) FROM users u), '[]'::json),
  'files', COALESCE((SELECT json_agg(f) FROM files f), '[]'::json)
);"""
result = subprocess.run([
    'docker', 'exec', container, 'sh', '-c',
    'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"',
    'sh', sql,
], check=True, capture_output=True, text=True)
data = json.loads(result.stdout)
if not isinstance(data.get('users'), list) or not isinstance(data.get('files'), list):
    sys.exit('Unexpected export format')
fd = os.open(Path(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(data, output)
print(f"Exported {len(data['users'])} accounts and {len(data['files'])} file records. Keep this file private.")
