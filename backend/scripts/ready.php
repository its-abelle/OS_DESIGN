<?php
declare(strict_types=1);

require '/var/www/app/vendor/autoload.php';

use Department\Database;
use Department\Storage;

for ($attempt = 1; $attempt <= 30; $attempt++) {
    try {
        Database::check(Database::connect());
        (new Storage())->ensureBucket();
        echo "MySQL schema and object storage ready.\n";
        exit(0);
    } catch (Throwable $error) {
        if ($attempt === 30) {
            fwrite(STDERR, 'Startup failed: '.$error->getMessage()."\n");
            exit(1);
        }
        sleep(1);
    }
}
