<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use OCP\IAppConfig;

/**
 * The secret Core and Cloud share (Core's storage/app/widget-secrets.json,
 * "cloud"), kept here as plainshow/widget_secret. It checks Core's widget
 * requests and signs the short-lived thumbnail links the widgets show.
 */
class Signing {
    public const THUMB_LIFETIME = 3600;

    public function __construct(
        private IAppConfig $appConfig,
    ) {
    }

    public function secret(): string {
        return $this->appConfig->getValueString('plainshow', 'widget_secret', '', lazy: true);
    }

    /** Signed query for Core's Cloud directory, tied to this Nextcloud account. */
    public function directoryQuery(string $account, ?int $now = null): array {
        $timestamp = $now ?? time();
        return [
            'account' => $account,
            'ts' => $timestamp,
            'sig' => hash_hmac('sha256', "cloud-directory|$account|$timestamp", $this->secret()),
        ];
    }

    /** Query string for a thumbnail of a file, valid for an hour, for one account. */
    public function thumbQuery(string $account, int $fileId, int $size, ?int $now = null): string {
        $expires = ($now ?? time()) + self::THUMB_LIFETIME;
        $sig = hash_hmac('sha256', "thumb|$account|$fileId|$size|$expires", $this->secret());
        return http_build_query(['a' => $account, 'x' => $size, 'e' => $expires, 's' => $sig]);
    }

    public function checkThumb(string $account, int $fileId, int $size, int $expires, string $sig, ?int $now = null): bool {
        $secret = $this->secret();
        return $secret !== '' && $account !== '' && $expires >= ($now ?? time())
            && hash_equals(hash_hmac('sha256', "thumb|$account|$fileId|$size|$expires", $secret), $sig);
    }
}
