<?php

declare(strict_types=1);

require __DIR__ . '/../apps/plainshow/lib/Service/WebRoutes.php';

use OCA\PlainShow\Service\WebRoutes;

$checks = 0;
function same(mixed $expected, mixed $actual): void {
    global $checks;
    $checks++;
    if ($expected !== $actual) {
        throw new RuntimeException('Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}
same('/apps/plainshow/', WebRoutes::route('', 'GET'));

foreach (['/', '/files', '/files/Holiday%202026', '/photos', '/photos/albums/12', '/calendar/week', '/calendar/tasks', '/settings', '/settings/devices', '/settings/admin', '/recent', '/favorites', '/shared/with-you', '/trash'] as $path) {
    same('/apps/plainshow' . $path, WebRoutes::route($path, 'GET'));
    same('/apps/plainshow' . $path, WebRoutes::route($path, 'HEAD'));
    same($path, WebRoutes::route($path, 'POST'));
}
foreach (['/remote.php/dav/files/alice/', '/ocs/v2.php/cloud/user', '/login/v2', '/login/flow', '/core/preview', '/apps/files/api/v1/recent', '/apps/plainshow/api/v1/health', '/apps/plainshow/api/web/settings', '/apps/plainshow/thumb/1', '/settings/ajax/setlanguage', '/s/abc123', '/status.php'] as $path) {
    same($path, WebRoutes::route($path, 'GET'));
}
foreach (['/apps/files', '/apps/files/', '/apps/files/files/123', '/f/123', '/apps/calendar/', '/apps/photos/', '/apps/dashboard', '/settings/personal/security', '/settings/admin/overview', '/apps/plainshow/', '/apps/plainshow/photos'] as $path) {
    same('/apps/plainshow/legacy', WebRoutes::route($path, 'GET'));
}
same('/files/Holiday%202026/a%23b%3F%25', WebRoutes::destination('/apps/files/', ['dir' => '/Holiday 2026/a#b?%']));
same('/files', WebRoutes::destination('/apps/files/', ['dir' => '/../private']));
same('/shared/with-you', WebRoutes::destination('/apps/files/', ['view' => 'sharingin']));
same('/calendar', WebRoutes::destination('/apps/calendar/timeGridWeek/now'));
same('/settings/devices', WebRoutes::destination('/settings/personal/security'));
same('/settings/admin', WebRoutes::destination('/settings/admin/overview'));
same('/calendar/week?date=2026-10-25', WebRoutes::destination('/apps/plainshow/calendar/week', ['date' => '2026-10-25', 'redirect' => '//evil.invalid']));
same(null, WebRoutes::destination('/apps/plainshow/api/web/settings'));
same(null, WebRoutes::destination('/apps/files/api/v1/recent'));
same(null, WebRoutes::destination('/apps/plainshow-other/'));
echo "$checks route checks passed.\n";
