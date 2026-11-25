<?php
declare(strict_types=1);

namespace Department;

use PDO;
use PDOException;

final class App
{
    private const COOKIE = 'os_sid';
    private const SESSION_SECONDS = 86400;
    // Same bcrypt cost for unknown accounts as registered accounts.
    private const DUMMY_HASH = '$2b$12$lZ4wJM35bb54M3B3dkAbg.Bg88bEnyuxbOviUppsYvS8vPx7oZUpy';

    public function __construct(private PDO $db) {}

    public static function respond(mixed $body, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        if ($status !== 204) {
            echo json_encode($body, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        exit;
    }

    private static function cookie(string $value, int $expires): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => $expires, 'path' => '/', 'httponly' => true,
            'secure' => Config::env('SESSION_COOKIE_SECURE', 'false') === 'true',
            'samesite' => 'Lax',
        ]);
    }

    private function tokenHash(): ?string
    {
        $token = $_COOKIE[self::COOKIE] ?? '';
        return is_string($token) && preg_match('/^[a-f0-9]{64}$/D', $token) ? hash('sha256', $token) : null;
    }

    private function signIn(int $userId): void
    {
        $token = bin2hex(random_bytes(32));
        $this->db->beginTransaction();
        try {
            if ($old = $this->tokenHash()) {
                $this->db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$old]);
            }
            $this->db->prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))')
                ->execute([hash('sha256', $token), $userId]);
            $this->db->commit();
        } catch (\Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
        self::cookie($token, time() + self::SESSION_SECONDS);
    }

    private function currentUser(): array
    {
        $hash = $this->tokenHash();
        if ($hash) {
            $query = $this->db->prepare('SELECT u.id, u.username, u.email FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()');
            $query->execute([$hash]);
            if ($user = $query->fetch()) {
                $user['id'] = (int) $user['id'];
                return $user;
            }
            $this->db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$hash]);
        }
        self::cookie('', time() - 3600);
        throw new ApiException('You are not logged in', 401);
    }

    private static function jsonBody(): array
    {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        if ($contentType !== 'application/json') {
            throw new ApiException('Send an application/json request', 415);
        }
        $raw = file_get_contents('php://input', false, null, 0, 16385);
        if ($raw === false || strlen($raw) > 16384) {
            throw new ApiException('Request body is too large', 413);
        }
        try {
            $body = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException('Invalid JSON body');
        }
        if (!$body instanceof \stdClass) {
            throw new ApiException('Send a JSON object');
        }
        return (array) $body;
    }

    private static function credentials(array $body): array
    {
        $email = $body['email'] ?? null;
        $password = $body['password'] ?? null;
        if (!is_string($email) || strlen(trim($email)) > 254 || !filter_var(trim($email), FILTER_VALIDATE_EMAIL)
            || !is_string($password) || mb_strlen($password, 'UTF-8') < 8 || strlen($password) > 72) {
            throw new ApiException('Provide a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes');
        }
        return [strtolower(trim($email)), $password];
    }

    private function register(array $body): never
    {
        $username = $body['username'] ?? null;
        if (!is_string($username) || !preg_match('/^[a-zA-Z0-9_-]{3,50}$/D', trim($username))) {
            throw new ApiException('Username must be 3–50 letters, numbers, underscores or hyphens');
        }
        [$email, $password] = self::credentials($body);
        $username = trim($username);
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        try {
            $this->db->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')->execute([$username, $email, $hash]);
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? null) === 1062) {
                throw new ApiException('Username or email is already registered', 409);
            }
            throw $error;
        }
        $id = (int) $this->db->lastInsertId();
        $this->signIn($id);
        self::respond(['user' => compact('id', 'username', 'email')], 201);
    }

    private function login(array $body): never
    {
        [$email, $password] = self::credentials($body);
        $query = $this->db->prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
        $query->execute([$email]);
        $user = $query->fetch();
        $matches = password_verify($password, $user['password_hash'] ?? self::DUMMY_HASH);
        if (!$user || !$matches) {
            throw new ApiException('Invalid email or password', 401);
        }
        unset($user['password_hash']);
        $user['id'] = (int) $user['id'];
        $this->signIn($user['id']);
        self::respond(['user' => $user]);
    }

    private static function fileRecord(array $row): array
    {
        return [
            'id' => (int) $row['id'], 'key' => $row['s3_key'],
            'originalFilename' => $row['original_filename'], 'mimeType' => $row['mime_type'],
            'sizeBytes' => (int) $row['size_bytes'], 'uploadedBy' => (int) $row['uploaded_by'],
            'createdAt' => (new \DateTimeImmutable($row['created_at'], new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }

    private static function positiveInteger(mixed $value, int $maximum): int
    {
        if (!is_string($value) || !preg_match('/^[0-9]+$/D', $value) || strlen($value) > 10
            || (int) $value < 1 || (int) $value > $maximum) {
            throw new ApiException('Use a limit from 1 to 20 and a positive integer before cursor');
        }
        return (int) $value;
    }

    private function listFiles(array $user): never
    {
        $limit = self::positiveInteger($_GET['limit'] ?? '20', 20);
        $before = isset($_GET['before']) ? self::positiveInteger($_GET['before'], 2147483647) : 2147483647;
        $search = $_GET['search'] ?? '';
        if (!is_string($search) || !mb_check_encoding($search, 'UTF-8') || mb_strlen($search, 'UTF-8') > 100) {
            throw new ApiException('Search must be text of at most 100 characters');
        }
        $query = $this->db->prepare('SELECT * FROM files WHERE uploaded_by = ? AND id < ? AND LOCATE(LOWER(?), LOWER(original_filename)) > 0 ORDER BY id DESC LIMIT ?');
        $query->bindValue(1, $user['id'], PDO::PARAM_INT);
        $query->bindValue(2, $before, PDO::PARAM_INT);
        $query->bindValue(3, trim($search), PDO::PARAM_STR);
        $query->bindValue(4, $limit + 1, PDO::PARAM_INT);
        $query->execute();
        $rows = $query->fetchAll();
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $storage = new Storage();
        $files = array_map(static function (array $row) use ($storage): array {
            return self::fileRecord($row) + ['available' => $storage->available($row['s3_key'])];
        }, $rows);
        self::respond(['files' => $files, 'nextCursor' => $hasMore ? end($files)['id'] : null, 'maxUploadBytes' => Config::maxUploadBytes()]);
    }

    private function upload(array $user): never
    {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > Config::maxUploadBytes() + 1048576) {
            throw new ApiException('File is too large', 413);
        }
        $file = $_FILES['file'] ?? null;
        if (!$file || !is_array($file) || is_array($file['error'] ?? null)) {
            throw new ApiException('Please choose one PDF to upload');
        }
        if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            throw new ApiException('File is too large', 413);
        }
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new ApiException('Could not read the upload');
        }
        $size = filesize($file['tmp_name']);
        if ($size === false || $size > Config::maxUploadBytes()) {
            throw new ApiException('File is too large', 413);
        }
        if (file_get_contents($file['tmp_name'], false, null, 0, 5) !== '%PDF-') {
            throw new ApiException('Only PDF files are allowed');
        }
        $name = basename(str_replace('\\', '/', $file['name']));
        if ($name === '' || mb_strlen($name, 'UTF-8') > 255) {
            throw new ApiException('Use a filename of at most 255 characters');
        }
        $storage = new Storage();
        $key = $storage->upload($file['tmp_name']);
        try {
            $this->db->prepare('INSERT INTO files (original_filename, s3_key, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)')
                ->execute([$name, $key, 'application/pdf', $size, $user['id']]);
        } catch (\Throwable $error) {
            try {
                $storage->delete($key);
            } catch (\Throwable $cleanupError) {
                error_log('Upload rollback failed for '.$key.': '.$cleanupError->getMessage());
            }
            throw $error;
        }
        $query = $this->db->prepare('SELECT * FROM files WHERE id = ?');
        $query->execute([$this->db->lastInsertId()]);
        self::respond(self::fileRecord($query->fetch()), 201);
    }

    private function download(array $user, string $key): never
    {
        if (!Storage::validKey($key)) {
            throw new ApiException('File not found', 404);
        }
        $query = $this->db->prepare('SELECT id FROM files WHERE s3_key = ? AND uploaded_by = ?');
        $query->execute([$key, $user['id']]);
        if (!$query->fetch()) {
            throw new ApiException('File not found', 404);
        }
        $lockName = 'download:'.$key;
        $lock = $this->db->prepare('SELECT GET_LOCK(?, 5)');
        $lock->execute([$lockName]);
        if ((int) $lock->fetchColumn() !== 1) {
            throw new ApiException('This file is being collected; retry shortly', 409);
        }
        try {
            $url = (new Storage())->download($key);
        } finally {
            $this->db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
        }
        self::respond(['url' => $url, 'expiresIn' => Storage::PRESIGN_SECONDS]);
    }

    public function run(): never
    {
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $method = $_SERVER['REQUEST_METHOD'];
        if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            throw new ApiException('Use the application from its own website', 403);
        }
        if ($method === 'GET' && $path === '/api/health') {
            Database::check($this->db);
            self::respond(['status' => 'ok', 'application' => 'PHP', 'database' => 'MySQL']);
        }
        if ($method === 'POST' && in_array($path, ['/api/auth/register', '/api/auth/login', '/api/auth/logout'], true)) {
            $body = self::jsonBody();
            if ($path === '/api/auth/register') {
                $this->register($body);
            }
            if ($path === '/api/auth/login') {
                $this->login($body);
            }
            if ($hash = $this->tokenHash()) {
                $this->db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$hash]);
            }
            self::cookie('', time() - 3600);
            self::respond(null, 204);
        }
        if ($method === 'GET' && $path === '/api/auth/me') {
            self::respond(['user' => $this->currentUser()]);
        }
        if ($path === '/api/files' || str_starts_with($path, '/api/files/')) {
            $user = $this->currentUser();
            if ($path === '/api/files') {
                if ($method === 'GET') {
                    $this->listFiles($user);
                }
                if ($method === 'POST') {
                    $this->upload($user);
                }
            }
            if ($method === 'GET' && preg_match('#^/api/files/([^/]+)/download$#D', $path, $match)) {
                $this->download($user, rawurldecode($match[1]));
            }
        }
        throw new ApiException('Endpoint not found', 404);
    }
}
