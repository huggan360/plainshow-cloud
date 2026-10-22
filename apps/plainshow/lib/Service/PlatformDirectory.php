<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use RuntimeException;

/** Active PlainShow accounts and groups that the current Cloud user may share with. */
class PlatformDirectory {
    public function __construct(private Signing $signing) {
    }

    public function forAccount(string $account): array {
        $url = 'https://plainshow.se/api/core/v1/directory/for-cloud-account?' . http_build_query($this->signing->directoryQuery($account));
        $connection = curl_init($url);
        curl_setopt_array($connection, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_RESOLVE => ['plainshow.se:443:127.0.0.1'],
        ]);
        $body = curl_exec($connection);
        $status = curl_getinfo($connection, CURLINFO_HTTP_CODE);
        curl_close($connection);
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($status !== 200 || !is_array($decoded) || !is_array($decoded['viewer'] ?? null) || !is_array($decoded['viewer']['capabilities'] ?? null) || !is_array($decoded['people'] ?? null) || !is_array($decoded['groups'] ?? null)) {
            throw new RuntimeException('PlainShow sharing directory is unavailable.');
        }

        return ['viewer' => $decoded['viewer'], 'people' => $decoded['people'], 'groups' => $decoded['groups']];
    }
}
