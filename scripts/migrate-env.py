#!/usr/bin/env python3
"""Migrate local configuration without printing secrets or deleting old data."""
from pathlib import Path
import os
import secrets
import sys


def migrate(path: Path) -> bool:
    original = path.read_text()
    entries = {}
    for line in original.splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            name, value = line.split('=', 1)
            entries[name.strip()] = value
    required = {'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD',
                'MYSQL_DATABASE', 'MYSQL_ROOT_PASSWORD', 'SESSION_COOKIE_SECURE'}
    if required <= entries.keys() and not any(k.startswith('POSTGRES_') for k in entries) and 'DATABASE_URL' not in entries:
        return False
    backup = path.with_name(path.name + '.before-php-mysql')
    if backup.exists():
        raise RuntimeError(f'{backup.name} already exists; review it before migrating again')
    rename = {'POSTGRES_USER': 'MYSQL_USER', 'POSTGRES_PASSWORD': 'MYSQL_PASSWORD',
              'POSTGRES_DB': 'MYSQL_DATABASE'}
    lines = []
    for line in original.splitlines():
        key = line.split('=', 1)[0].strip() if '=' in line else ''
        if key in {'DATABASE_URL', 'SESSION_SECRET'}:
            continue
        if key in rename:
            if rename[key] not in entries:
                lines.append(rename[key] + '=' + entries[key])
                entries[rename[key]] = entries[key]
            continue
        lines.append(line)
    defaults = {'MYSQL_HOST': 'database', 'MYSQL_PORT': '3306', 'MYSQL_USER': 'app',
                'MYSQL_PASSWORD': secrets.token_hex(24), 'MYSQL_DATABASE': 'appdb',
                'MYSQL_ROOT_PASSWORD': secrets.token_hex(24), 'SESSION_COOKIE_SECURE': 'false'}
    for key, value in defaults.items():
        if key not in entries:
            lines.append(f'{key}={value}')
    # Exclusive creation prevents accidental overwrite of the pre-migration config.
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(original)
    temporary = path.with_name(path.name + '.migration-tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    temporary.replace(path)
    return True


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / '.env'
    print('Migrated local config; original saved in .env.before-php-mysql.' if migrate(path)
          else 'MySQL configuration already present; no changes made.')
