<?php
declare(strict_types=1);

// Read a private export from scripts/export-postgres.py on stdin.
require '/var/www/app/vendor/autoload.php';

use Department\Database;

$data = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
if (!is_array($data['users'] ?? null) || !is_array($data['files'] ?? null)) {
    throw new RuntimeException('Expected users and files arrays');
}
$db = Database::connect();
$db->beginTransaction();
try {
    if ((int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 0
        || (int) $db->query('SELECT COUNT(*) FROM files')->fetchColumn() !== 0) {
        throw new RuntimeException('Import requires an empty application database. Existing rows were not changed.');
    }
    $utc = new DateTimeZone('UTC');
    $timestamp = static fn(string $value): string => (new DateTimeImmutable($value))->setTimezone($utc)->format('Y-m-d H:i:s.v');
    $insertUser = $db->prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)');
    foreach ($data['users'] as $user) {
        $insertUser->execute([$user['id'], $user['username'], $user['email'], $user['password_hash'], $timestamp($user['created_at'])]);
    }
    $insertFile = $db->prepare('INSERT INTO files (id, original_filename, s3_key, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach ($data['files'] as $file) {
        $insertFile->execute([$file['id'], $file['original_filename'], $file['s3_key'], $file['mime_type'], $file['size_bytes'], $file['uploaded_by'], $timestamp($file['created_at'])]);
    }
    $db->commit();
    echo "Imported accounts and file metadata. MinIO objects remain in their existing volume. Sign in again to create PHP sessions.\n";
} catch (Throwable $error) {
    $db->rollBack();
    throw $error;
}
