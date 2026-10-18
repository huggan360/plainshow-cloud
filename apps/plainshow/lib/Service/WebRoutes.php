<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

class WebRoutes {
    private const PAGES = '~^/(?:files(?:/.*)?|recent|favorites|shared/(?:with-you|by-you)|trash|photos(?:/albums(?:/\d+)?)?|calendar(?:/(?:month|week|day|agenda|tasks))?|settings(?:/(?:devices|admin))?)?/?$~D';

    public static function route(string $path, string $method): string {
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            return $path;
        }
        $path = $path === '' ? '/' : $path;
        if (preg_match(self::PAGES, $path)) {
            return '/apps/plainshow' . (rtrim($path, '/') ?: '/');
        }
        if (self::destination($path) !== null) {
            return '/apps/plainshow/legacy';
        }
        return $path;
    }

    public static function destination(string $path, array $query = []): ?string {
        if (str_starts_with($path, '/apps/plainshow')) {
            $inside = substr($path, strlen('/apps/plainshow')) ?: '/';
            if (preg_match(self::PAGES, $inside)) {
                $params = array_intersect_key($query, array_flip(['date', 'list', 'open']));
                return (rtrim($inside, '/') ?: '/') . ($params ? '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986) : '');
            }
        }
        if (preg_match('~^/apps/files(?:/|/files(?:/\d+)?)?$~D', $path) || preg_match('~^/f/\d+/?$~D', $path)) {
            $views = ['recent' => '/recent', 'favorites' => '/favorites', 'sharingin' => '/shared/with-you', 'sharingout' => '/shared/by-you', 'trashbin' => '/trash'];
            $view = is_string($query['view'] ?? null) ? $query['view'] : '';
            if (isset($views[$view])) {
                return $views[$view];
            }
            $dir = is_string($query['dir'] ?? null) ? $query['dir'] : '';
            return '/files' . self::filePath($dir);
        }
        if (preg_match('~^/apps/(calendar|photos|dashboard)(?:/.*)?$~D', $path, $matches)) {
            return match ($matches[1]) {
                'calendar' => '/calendar',
                'photos' => '/photos',
                default => '/',
            };
        }
        if (preg_match('~^/settings/(personal|admin)(?:/.*)?$~D', $path, $matches)) {
            return str_contains($path, '/security') ? '/settings/devices' : ($matches[1] === 'admin' ? '/settings/admin' : '/settings');
        }
        return null;
    }

    public static function filePath(string $path): string {
        $parts = array_values(array_filter(explode('/', trim($path, '/')), static fn (string $part): bool => $part !== ''));
        if (array_intersect($parts, ['.', '..'])) {
            return '';
        }
        return $parts ? '/' . implode('/', array_map('rawurlencode', $parts)) : '';
    }
}
