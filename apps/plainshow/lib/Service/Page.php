<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IURLGenerator;
use OCP\Util;
use PlainShow\Kit\Lang;

/** The one page Cloud's browser app lives in, for people signed in and for share links. */
class Page {
    public function __construct(private IURLGenerator $urls) {
    }

    /**
     * @param array $boot what the app needs to start (see src/boot.ts)
     * @param array $meta extra <meta property=...> tags, for link previews
     */
    public function render(array $boot, string $title = 'Cloud | PlainShow', array $meta = []): TemplateResponse {
        $app = __DIR__ . '/../..';
        $response = new TemplateResponse('plainshow', 'main', [
            'lang' => Lang::current(),
            'boot' => $boot + [
                'base' => \OC::$WEBROOT,
                'apiBase' => rtrim($this->urls->linkToRoute('plainshow.page.index'), '/'),
                'webroot' => \OC::$WEBROOT,
                'requestToken' => Util::callRegister(),
            ],
            'title' => Lang::t($title),
            'meta' => $meta,
            'version' => substr(md5((string)@filemtime("$app/ui/css/plainshow.css")), 0, 10),
            'bundle' => $this->bundle($app),
        ], TemplateResponse::RENDER_AS_BLANK);

        $policy = new ContentSecurityPolicy();
        $policy->addAllowedImageDomain('blob:');
        $policy->addAllowedMediaDomain('blob:');
        $policy->addAllowedWorkerSrcDomain('blob:');
        $policy->addAllowedFrameDomain('blob:');
        $policy->addAllowedFrameDomain('\'self\'');
        $response->setContentSecurityPolicy($policy);
        return $response;
    }

    /** The built script and stylesheet, from Vite's manifest. */
    private function bundle(string $app): array {
        $manifest = json_decode((string)@file_get_contents("$app/js/.vite/manifest.json"), true) ?: [];
        $entry = $manifest['src/main.tsx'] ?? [];
        // With one stylesheet for everything, Vite lists it on its own as style.css.
        return ['js' => $entry['file'] ?? 'cloud.js', 'css' => $entry['css'][0] ?? $manifest['style.css']['file'] ?? null];
    }
}
