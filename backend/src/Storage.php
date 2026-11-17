<?php
declare(strict_types=1);

namespace Department;

use Aws\Exception\AwsException;
use Aws\S3\S3Client;

final class Storage
{
    public const PRESIGN_SECONDS = 60;
    public const CLEANUP_AGE_SECONDS = 120;
    private S3Client $client;
    private S3Client $signer;
    private string $bucket;

    public function __construct()
    {
        $this->bucket = Config::env('S3_BUCKET_NAME');
        $options = [
            'version' => 'latest', 'region' => Config::env('AWS_REGION', 'us-east-1'),
            'credentials' => [
                'key' => Config::env('AWS_ACCESS_KEY_ID'),
                'secret' => Config::env('AWS_SECRET_ACCESS_KEY'),
            ],
            'http' => ['connect_timeout' => 3, 'timeout' => 10],
            'retries' => 1,
        ];
        $endpoint = getenv('S3_ENDPOINT');
        if ($endpoint) {
            $options['endpoint'] = $endpoint;
            $options['use_path_style_endpoint'] = true;
        }
        $this->client = new S3Client($options);
        if ($public = getenv('S3_PUBLIC_ENDPOINT')) {
            $options['endpoint'] = $public;
            $options['use_path_style_endpoint'] = true;
        }
        $this->signer = new S3Client($options);
    }

    private function execute(callable $operation): mixed
    {
        try {
            return $operation();
        } catch (AwsException $error) {
            $status = $error->getStatusCode();
            if ($status === 404) {
                throw new ApiException('File not found', 404);
            }
            if (in_array($status, [401, 403], true)) {
                throw new ApiException('File storage rejected our credentials', 502);
            }
            if ($status === null) {
                throw new ApiException('File storage is unreachable, try again shortly', 503);
            }
            throw $error;
        }
    }

    public function ensureBucket(): void
    {
        try {
            $this->client->headBucket(['Bucket' => $this->bucket]);
        } catch (AwsException $error) {
            if ($error->getStatusCode() !== 404) {
                throw $error;
            }
            $options = ['Bucket' => $this->bucket];
            $region = Config::env('AWS_REGION', 'us-east-1');
            if (!getenv('S3_ENDPOINT') && $region !== 'us-east-1') {
                $options['CreateBucketConfiguration'] = ['LocationConstraint' => $region];
            }
            $this->client->createBucket($options);
        }
    }

    public static function validKey(string $key): bool
    {
        return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/D', $key);
    }

    private static function key(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20).'.pdf';
    }

    public function upload(string $path): string
    {
        $key = self::key();
        $this->execute(fn() => $this->client->putObject([
            'Bucket' => $this->bucket, 'Key' => $key,
            'SourceFile' => $path, 'ContentType' => 'application/pdf',
        ]));
        return $key;
    }

    public function delete(string $key): void
    {
        $this->execute(fn() => $this->client->deleteObject(['Bucket' => $this->bucket, 'Key' => $key]));
    }

    public function available(string $key): bool
    {
        if (!self::validKey($key)) {
            throw new ApiException('Invalid file key');
        }
        try {
            $this->execute(fn() => $this->client->headObject(['Bucket' => $this->bucket, 'Key' => $key]));
            return true;
        } catch (ApiException $error) {
            if ($error->status === 404) {
                return false;
            }
            throw $error;
        }
    }

    // Caller holds a per-file MySQL lock across copy/delete/sign.
    public function download(string $key): string
    {
        if (!self::validKey($key)) {
            throw new ApiException('File not found', 404);
        }
        $destination = 'downloaded/'.$key;
        // Prepare the signature before removing the live object.
        $command = $this->signer->getCommand('GetObject', [
            'Bucket' => $this->bucket, 'Key' => $destination,
            'ResponseContentDisposition' => 'attachment',
        ]);
        $url = (string) $this->signer->createPresignedRequest($command, '+'.self::PRESIGN_SECONDS.' seconds')->getUri();
        $this->execute(fn() => $this->client->copyObject([
            'Bucket' => $this->bucket, 'Key' => $destination,
            'CopySource' => rawurlencode($this->bucket).'/'.rawurlencode($key),
        ]));
        $this->delete($key);
        return $url;
    }

    public function cleanup(): int
    {
        $count = 0;
        $pages = $this->client->getPaginator('ListObjectsV2', ['Bucket' => $this->bucket, 'Prefix' => 'downloaded/']);
        foreach ($pages as $page) {
            foreach ($page['Contents'] ?? [] as $object) {
                if ($object['LastModified']->getTimestamp() <= time() - self::CLEANUP_AGE_SECONDS) {
                    $this->delete($object['Key']);
                    $count++;
                }
            }
        }
        return $count;
    }
}
