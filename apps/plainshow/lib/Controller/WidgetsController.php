<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\Recent;
use OCA\PlainShow\Service\Signing;
use OCA\PlainShow\Service\Upcoming;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserManager;
use PlainShow\Kit\KitException;
use PlainShow\Kit\Widgets;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Cloud's widgets on the PlainShow dashboard. Core signs each request for a
 * person and names their Cloud account (PlainShow\Kit\Widgets), so they work
 * without a Cloud session. Calendar and files answer in the shape Core's own
 * Cloud widgets draw; photos is a gallery.
 */
class WidgetsController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private Signing $signing,
        private Upcoming $upcoming,
        private Recent $recent,
        private IUserManager $users,
        private IURLGenerator $urls,
        private LoggerInterface $logger,
    ) {
        parent::__construct($appName, $request);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/widgets/{widget}')]
    public function show(string $widget): JSONResponse {
        if (!in_array($widget, ['calendar', 'files', 'photos'], true)) {
            return $this->answer(['ok' => false, 'message' => 'Unknown widget.'], Http::STATUS_NOT_FOUND);
        }
        try {
            $account = Widgets::verifyWithAccount($this->request->getParams(), $widget, $this->signing->secret())['account'];
        } catch (KitException $error) {
            return $this->answer(['ok' => false, 'message' => $error->getMessage()], Http::STATUS_FORBIDDEN);
        }
        if ($account === null || !$this->users->userExists($account)) {
            return $this->answer(['connected' => false]);
        }

        // Optional: how many (lists load more as they scroll) and, for the calendar, which days.
        $limit = max(1, min(200, (int)($this->request->getParam('limit') ?: 30)));
        $days = max(1, min(62, (int)($this->request->getParam('days') ?: 31)));
        $from = $this->request->getParam('from');
        try {
            return $this->answer(match ($widget) {
                'calendar' => ['connected' => true, 'events' => $this->upcoming->events($account, $days, $limit, is_string($from) ? $from : null)],
                'files' => ['connected' => true, 'files' => $this->recent->files($account, min(50, $limit))],
                'photos' => $this->photos($account),
            });
        } catch (Throwable $error) {
            $this->logger->error('Widget failed', ['exception' => $error, 'widget' => $widget]);
            return $this->answer(['connected' => true, 'error' => 'Could not read Cloud.']);
        }
    }

    private function photos(string $account): array {
        $images = array_map(fn ($file) => [
            'src' => $this->urls->getAbsoluteURL('/index.php/apps/plainshow/thumb/' . $file->getId() . '?' . $this->signing->thumbQuery($account, $file->getId(), 256)),
            'url' => $this->urls->getAbsoluteURL('/index.php/f/' . $file->getId()),
            'alt' => $file->getName(),
        ], $this->recent->photos($account, 12));

        return ['type' => 'gallery', 'images' => $images, 'empty' => \PlainShow\Kit\Lang::t('No photos yet.'), 'more' => ['label' => \PlainShow\Kit\Lang::t('Photos'), 'url' => $this->urls->getAbsoluteURL('/')]];
    }

    private function answer(array $data, int $status = Http::STATUS_OK): JSONResponse {
        $response = new JSONResponse($data, $status);
        $response->addHeader('Cache-Control', 'no-store');
        return $response;
    }
}
