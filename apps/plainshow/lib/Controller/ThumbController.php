<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\Signing;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IPreview;
use OCP\IRequest;
use Throwable;

/** A thumbnail for a link the widgets signed: one file, one account, one hour. */
class ThumbController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private Signing $signing,
        private IRootFolder $root,
        private IPreview $previews,
    ) {
        parent::__construct($appName, $request);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/thumb/{fileId}')]
    public function show(int $fileId, string $a = '', int $x = 256, int $e = 0, string $s = ''): Response {
        if (!in_array($x, [64, 256, 1024], true) || !$this->signing->checkThumb($a, $fileId, $x, $e, $s)) {
            return new Response(Http::STATUS_FORBIDDEN);
        }
        try {
            $file = $this->root->getUserFolder($a)->getFirstNodeById($fileId);
            if (!$file instanceof File) {
                return new Response(Http::STATUS_NOT_FOUND);
            }
            $preview = $this->previews->getPreview($file, $x, $x, true);
            $response = new FileDisplayResponse($preview, Http::STATUS_OK, ['Content-Type' => $preview->getMimeType()]);
            $response->cacheFor(3600, false, true);
            return $response;
        } catch (Throwable) {
            return new Response(Http::STATUS_NOT_FOUND);
        }
    }
}
