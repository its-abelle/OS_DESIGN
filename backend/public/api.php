<?php
declare(strict_types=1);

require '/var/www/app/vendor/autoload.php';

use Department\ApiException;
use Department\App;
use Department\Database;

try {
    (new App(Database::connect()))->run();
} catch (ApiException $error) {
    App::respond(['error' => $error->getMessage()], $error->status);
} catch (Throwable $error) {
    error_log((string) $error);
    App::respond(['error' => 'Could not complete the request. Check the application services and retry.'], 500);
}
