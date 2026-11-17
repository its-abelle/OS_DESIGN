<?php
declare(strict_types=1);

namespace Department;

use PDO;

final class Database
{
    public static function connect(): PDO
    {
        $host = Config::env('MYSQL_HOST', 'database');
        $port = Config::env('MYSQL_PORT', '3306');
        $name = Config::env('MYSQL_DATABASE', 'appdb');
        foreach ([$host, $port, $name] as $part) {
            if (!preg_match('/^[a-zA-Z0-9_.-]+$/D', $part)) {
                throw new \RuntimeException('Invalid MySQL connection configuration');
            }
        }
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ];
        if ($ca = getenv('MYSQL_SSL_CA')) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
            $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
        }
        $db = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4",
            Config::env('MYSQL_USER'), Config::env('MYSQL_PASSWORD'), $options);
        $db->exec("SET time_zone = '+00:00'");
        return $db;
    }

    public static function check(PDO $db): void
    {
        foreach (['users', 'files', 'sessions'] as $table) {
            $db->query("SELECT 1 FROM `$table` LIMIT 0");
        }
    }
}
