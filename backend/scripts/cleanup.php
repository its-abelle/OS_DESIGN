<?php
declare(strict_types=1);

require '/var/www/app/vendor/autoload.php';

use Department\Database;
use Department\Storage;

$loop = in_array('--loop', $argv, true);
do {
    try {
        $count = (new Storage())->cleanup();
        Database::connect()->exec('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()');
        echo "Removed $count expired PDF copies and swept expired sessions.\n";
    } catch (Throwable $error) {
        fwrite(STDERR, 'Cleanup failed: '.$error->getMessage()."\n");
        if (!$loop) {
            exit(1);
        }
    }
    if ($loop) {
        sleep(60);
    }
} while ($loop);
