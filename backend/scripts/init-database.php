<?php
declare(strict_types=1);

require '/var/www/app/vendor/autoload.php';

use Department\Database;

$db = Database::connect();
$locked = false;
try {
    $locked = (int) $db->query("SELECT GET_LOCK('department_of_files_schema', 10)")->fetchColumn() === 1;
    if (!$locked) {
        throw new RuntimeException('Another schema setup is running');
    }
    $query = $db->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users', 'files', 'sessions')");
    $count = count($query->fetchAll());
    if ($count === 3) {
        Database::check($db);
        echo "Application tables already exist; no changes made.\n";
    } elseif ($count !== 0) {
        throw new RuntimeException('Partial schema found. Review and repair it before continuing; MySQL DDL is not transactional.');
    } else {
        $schema = file_get_contents('/var/www/app/db/init.sql');
        foreach (explode(';', $schema) as $statement) {
            if (trim($statement) !== '') {
                $db->exec($statement);
            }
        }
        Database::check($db);
        echo "Created MySQL users, files and sessions tables.\n";
    }
} finally {
    if ($locked) {
        $db->query("SELECT RELEASE_LOCK('department_of_files_schema')");
    }
}
