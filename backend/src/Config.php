<?php
declare(strict_types=1);

namespace Department;

final class Config
{
    public static function env(string $name, ?string $default = null): string
    {
        $value = getenv($name);
        if ($value !== false && $value !== '') {
            return $value;
        }
        return $default ?? throw new \RuntimeException("Missing required configuration: $name");
    }

    public static function maxUploadBytes(): int
    {
        $mb = filter_var(self::env('MAX_UPLOAD_MB', '10'), FILTER_VALIDATE_INT);
        if ($mb === false || $mb < 1 || $mb > 100) {
            throw new \RuntimeException('MAX_UPLOAD_MB must be an integer from 1 to 100');
        }
        if (self::env('DEPLOYMENT_TARGET', 'compose') === 'vercel') {
            $mb = min($mb, 4);
        }
        return $mb * 1024 * 1024;
    }
}
