#!/usr/bin/env python3
"""Exercise the real Nginx -> Apache/PHP -> MySQL/MinIO stack, using stdlib only.

Run on the Ubuntu host after docker compose up --build -d --wait.
Uses temporary accounts/objects, removed in finally. Never uses real accounts.
"""
import concurrent.futures
import http.cookiejar
import hashlib
import re
import json
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request
import os

ROOT = Path(__file__).resolve().parents[2]
BASE = os.environ.get('TEST_BASE_URL', 'http://localhost:8080').rstrip('/')
PASSWORD = 'integration-test-password'
PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'


class Client:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, path, method='GET', body=None, headers=None):
        request_headers = dict(headers or {})
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            request_headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(BASE + path, data=body, headers=request_headers, method=method)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        is_json = 'application/json' in response.headers.get('Content-Type', '')
        return response.status, json.loads(raw) if raw and is_json else raw, response.headers

    def upload(self, name='sample.pdf', content=PDF, extra=False):
        boundary = '----cosc428' + secrets.token_hex(12)
        parts = []
        if extra:
            for key, value in [('uploadedBy', '999999'), ('sizeBytes', '1'), ('mimeType', 'image/png')]:
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/pdf\r\n\r\n'.encode())
        body = b''.join(parts) + content + f'\r\n--{boundary}--\r\n'.encode()
        return self.request('/api/files', 'POST', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})


# JSON parameters are passed over stdin; SQL and PHP code are fixed strings.
PROBE = r'''
require '/var/www/app/vendor/autoload.php';
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$db = \Department\Database::connect();
$q = $db->prepare('SELECT * FROM users WHERE username = ?');
$q->execute([$input['username']]);
$user = $q->fetch();
if (!$user) { echo 'null'; exit; }
$id = $user['id'];
switch ($input['action']) {
case 'inspect':
    $q = $db->prepare('SELECT * FROM files WHERE uploaded_by = ? ORDER BY id DESC');
    $q->execute([$id]);
    echo json_encode(['passwordVerified' => password_verify($input['password'], $user['password_hash']),
        'hashDiffers' => $user['password_hash'] !== $input['password'], 'files' => $q->fetchAll()]);
    break;
case 'expire':
    $db->prepare('UPDATE sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE user_id = ?')->execute([$id]);
    echo 'true';
    break;
case 'delete':
    $q = $db->prepare('SELECT s3_key FROM files WHERE uploaded_by = ?');
    $q->execute([$id]);
    $storage = new \Department\Storage();
    foreach ($q->fetchAll() as $file) {
        $storage->delete($file['s3_key']);
        $storage->delete('downloaded/'.$file['s3_key']);
    }
    $db->beginTransaction();
    $db->prepare('DELETE FROM files WHERE uploaded_by = ?')->execute([$id]);
    $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    $db->commit();
    echo 'true';
    break;
default: throw new RuntimeException('Invalid test operation');
}
'''


def probe(action, username):
    result = subprocess.run(['docker', 'compose', 'exec', '-T', 'backend', 'php', '-r', PROBE],
                            cwd=ROOT, input=json.dumps({'action': action, 'username': username, 'password': PASSWORD}),
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    print('PASS', description)


def run():
    prefix = 'verify_' + secrets.token_hex(6)
    accounts = [prefix + '_a', prefix + '_b']
    alice, bob, anonymous = Client(), Client(), Client()
    try:
        status, page, _ = anonymous.request('/')
        check(status == 200 and b'<title>Department of Files' in page and b'<?php' not in page, 'PHP GUI served through Nginx')
        for asset in ('styles.css', 'app.js'):
            match = re.search(rb'/' + re.escape(asset.encode()) + rb'\?v=([a-f0-9]{64})', page)
            check(match is not None, f'{asset} uses a content version')
            asset_status, content, _ = anonymous.request('/' + asset + '?v=' + match[1].decode())
            check(asset_status == 200 and hashlib.sha256(content).hexdigest().encode() == match[1],
                  f'{asset} version matches the served content')
        status, health, _ = anonymous.request('/api/health')
        check(status == 200 and health['database'] == 'MySQL' and health['application'] == 'PHP', 'PHP connects to MySQL')
        check(anonymous.request('/api/files')[0] == 401, 'anonymous listing rejected')
        check(anonymous.upload()[0] == 401, 'anonymous upload rejected')
        check(anonymous.request('/api/auth/register', 'POST', b'{', {'Content-Type': 'application/json'})[0] == 400, 'malformed JSON rejected')
        check(anonymous.request('/api/auth/register', 'POST', b'{}', {'Content-Type': 'text/plain'})[0] == 415, 'incorrect content type rejected')
        check(anonymous.request('/api/auth/register', 'POST', {'username': 'x', 'email': 'bad', 'password': 'short'})[0] == 400, 'invalid registration rejected')
        for client, name in [(alice, accounts[0]), (bob, accounts[1])]:
            status, result, headers = client.request('/api/auth/register', 'POST', {'username': name, 'email': name+'@example.com', 'password': PASSWORD})
            check(status == 201 and result['user']['username'] == name, 'registration signs in ' + name)
            cookie = headers.get('Set-Cookie', '')
            check('HttpOnly' in cookie and 'SameSite=Lax' in cookie, 'protected session cookie')
        alice_id = alice.request('/api/auth/me')[1]['user']['id']
        check(anonymous.request('/api/auth/register', 'POST', {'username': accounts[0], 'email': accounts[0]+'@example.com', 'password': PASSWORD})[0] == 409, 'duplicate account rejected')
        check(alice.request('/api/auth/me', headers={'Sec-Fetch-Site': 'cross-site'})[0] == 403, 'cross-site requests rejected')
        check(alice.upload(content=b'not a PDF')[0] == 400, 'PDF signature validated on server')
        status, record, _ = alice.upload(extra=True)
        check(status == 201 and record['uploadedBy'] == alice_id and record['sizeBytes'] == len(PDF) and record['mimeType'] == 'application/pdf', 'real upload ignores spoofed metadata')
        key = record['key']
        database = probe('inspect', accounts[0])
        check(database['passwordVerified'] and database['hashDiffers'], 'MySQL stores a verifiable password hash')
        check(database['files'][0]['s3_key'] == key and database['files'][0]['id'] == record['id'], 'API receipt matches the stored MySQL row')
        check(bob.request('/api/files')[1]['files'] == [], 'other account cannot list private records')
        check(bob.request('/api/files/'+key+'/download')[0] == 404, 'other account cannot consume the PDF')
        check(anonymous.request('/api/files/'+key+'/download')[0] == 401, 'anonymous download rejected')
        check(alice.request('/api/files?limit=21')[0] == 400 and alice.request('/api/files?before[]=1')[0] == 400, 'invalid pagination rejected')
        status, second, _ = alice.upload('second.pdf')
        check(status == 201, 'second upload succeeds')
        _, first_page, _ = alice.request('/api/files?limit=1')
        _, next_page, _ = alice.request('/api/files?limit=1&before='+str(first_page['nextCursor']))
        check(first_page['files'][0]['id'] == second['id'] and next_page['files'][0]['id'] == record['id'] and next_page['nextCursor'] is None, 'pagination returns only the account records in order')
        status, matching, _ = alice.request('/api/files?search=SECOND')
        check(status == 200 and [f['id'] for f in matching['files']] == [second['id']], 'filename search is case insensitive')
        check(bob.request('/api/files?search=second')[1]['files'] == [], 'search stays private to the account')
        check(alice.request('/api/files?search=%25')[1]['files'] == [] and alice.request('/api/files?search=_')[1]['files'] == [], 'search treats wildcard characters literally')
        check(alice.request('/api/files?search[]=x')[0] == 400 and alice.request('/api/files?search='+'x'*101)[0] == 400, 'invalid search parameters rejected')
        _, filtered_first, _ = alice.request('/api/files?limit=1&search=.pdf')
        _, filtered_next, _ = alice.request('/api/files?limit=1&search=.pdf&before='+str(filtered_first['nextCursor']))
        check(filtered_first['files'][0]['id'] == second['id'] and filtered_next['files'][0]['id'] == record['id'] and filtered_next['nextCursor'] is None, 'search works across paginated results')
        max_bytes = first_page['maxUploadBytes']
        check(alice.upload('oversized.pdf', b'%PDF-' + b'0' * max_bytes)[0] == 413, 'upload limit enforced')
        status, download, _ = alice.request('/api/files/'+key+'/download')
        check(status == 200 and download['expiresIn'] == 60, 'authorized temporary link issued')
        with urllib.request.urlopen(download['url'], timeout=20) as response:
            check(response.read() == PDF, 'download returns the original PDF bytes')
        check(alice.request('/api/files/'+key+'/download')[0] == 404, 'collected PDF cannot receive another link')
        listed = alice.request('/api/files')[1]['files']
        check(next(f for f in listed if f['key'] == key)['available'] is False, 'MySQL receipt survives collection')
        # Share the same session with independent HTTP clients to test the MySQL lock.
        cookie_header = '; '.join(c.name+'='+c.value for c in alice.cookies)
        def collect_again(_):
            return Client().request('/api/files/'+second['key']+'/download', headers={'Cookie': cookie_header})[0]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            statuses = sorted(executor.map(collect_again, range(2)))
        check(statuses.count(200) == 1 and all(s in (200, 404, 409) for s in statuses), 'concurrent collection issues exactly one link')
        old_cookie = cookie_header
        check(alice.request('/api/auth/logout', 'POST', {})[0] == 204, 'logout succeeds')
        check(Client().request('/api/auth/me', headers={'Cookie': old_cookie})[0] == 401, 'logged-out session cannot be replayed')
        check(alice.request('/api/auth/login', 'POST', {'email': accounts[0]+'@example.com', 'password': 'wrong-password'})[0] == 401, 'incorrect password rejected')
        check(alice.request('/api/auth/login', 'POST', {'email': accounts[0]+'@example.com', 'password': PASSWORD})[0] == 200, 'PHP login verifies stored password')
        new_cookie = '; '.join(c.name+'='+c.value for c in alice.cookies)
        check(old_cookie != new_cookie, 'login rotates the session token')
        probe('expire', accounts[0])
        check(alice.request('/api/files')[0] == 401, 'MySQL session expiry enforced')
        bob_cookie = '; '.join(c.name+'='+c.value for c in bob.cookies)
        probe('delete', accounts[1])
        check(Client().request('/api/files', headers={'Cookie': bob_cookie})[0] == 401, 'deleted account loses session access')
    finally:
        cleanup_errors = []
        for name in accounts:
            try:
                probe('delete', name)
            except Exception as error:
                cleanup_errors.append(f'{name}: {error}')
        if cleanup_errors:
            raise RuntimeError('Test cleanup needs attention: ' + '; '.join(cleanup_errors))
    print('Integration checks passed; temporary accounts, rows and objects removed.')


if __name__ == '__main__':
    run()
