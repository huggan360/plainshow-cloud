<?php
/**
 * PlainShow's error page for an HTTP status, from the UI kit (ui/errors).
 * The server's installed copy wins, so all services show the same pages.
 *
 * @var array{code: int} $_
 */
$code = in_array((int)$_['code'], [401, 403, 404, 429, 500, 503], true) ? (int)$_['code'] : 404;
foreach (["/srv/plainshow/errors/$code.html", __DIR__ . "/../vendor/plainshow/kit/ui/errors/$code.html"] as $page) {
    if (is_readable($page)) {
        print_unescaped(file_get_contents($page));
        return;
    }
}
p("Error $code");
