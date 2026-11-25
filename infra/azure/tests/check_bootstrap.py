"""Check the rendered Azure bootstrap and Compose overrides without provisioning."""
import json
from pathlib import Path
import subprocess
import tempfile

AZURE = Path(__file__).resolve().parents[1]
ROOT = AZURE.parents[1]
inputs = {
    'app_host': 'department-files-test.southafricanorth.cloudapp.azure.com',
    'source_revision': '87c3dfc525f17a1d7f6b974818e8632cd2a68ae8',
    'compose': (AZURE / 'compose.azure.yaml').read_text(),
    'caddyfile': (AZURE / 'Caddyfile').read_text(),
}
expression = ('templatefile("bootstrap.sh.tftpl", {app_host=' + json.dumps(inputs['app_host'])
              + ',source_revision=' + json.dumps(inputs['source_revision'])
              + ',compose=file("compose.azure.yaml"),caddyfile=file("Caddyfile")})\n')
result = subprocess.run(['terraform', f'-chdir={AZURE}', 'console',
                         '-var=subscription_id=00000000-0000-0000-0000-000000000000',
                         '-var=ssh_source_cidr=203.0.113.10/32',
                         '-var=ssh_public_key_path=tests/fixtures/id_ed25519.pub'],
                        input=expression, text=True, capture_output=True)
if result.returncode:
    raise RuntimeError(result.stderr)
rendered = result.stdout
assert rendered.startswith('<<EOT\n') and rendered.endswith('\nEOT\n'), rendered
script = rendered[len('<<EOT\n'):-len('\nEOT\n')]
subprocess.run(['bash', '-n'], input=script, text=True, check=True)
assert 'S3_PUBLIC_ENDPOINT=https://' + inputs['app_host'] + ':9443' in script
assert 'SESSION_COOKIE_SECURE=true' in script
assert 'if [ ! -s .env ]; then' in script
assert script.count('$(openssl rand -hex 24)') == 3
with tempfile.TemporaryDirectory() as temp:
    env_file = Path(temp) / '.env'
    env_file.write_text('APP_HOST=' + inputs['app_host'] + '\nMYSQL_USER=app\n'
                        'MYSQL_DATABASE=appdb\nMYSQL_PASSWORD=test-app-password\n'
                        'MYSQL_ROOT_PASSWORD=test-root-password\nAWS_ACCESS_KEY_ID=minioadmin\n'
                        'AWS_SECRET_ACCESS_KEY=test-storage-password\n')
    result = subprocess.run(['docker', 'compose', '--env-file', str(env_file),
                             '-f', str(ROOT / 'compose.yaml'),
                             '-f', str(AZURE / 'compose.azure.yaml'), 'config', '--format', 'json'],
                            text=True, capture_output=True, check=True)
    services = json.loads(result.stdout)['services']
    assert not services['frontend'].get('ports')
    assert not services['minio'].get('ports')
    assert not services['database'].get('ports')
    assert {p['published'] for p in services['caddy']['ports']} == {'80', '443', '9443'}
    assert all(service.get('restart') == 'unless-stopped' for service in services.values())
print('Bootstrap shell syntax, credential preservation, secure endpoints and private service ports pass.')
