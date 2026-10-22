<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\DAV\CalDAV\CalDavBackend;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IUserSession;

class CalendarController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $session,
        private CalDavBackend $calDav,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/calendar/subscriptions/{uri}/objects', requirements: ['uri' => '[^/]+'])]
    public function subscriptionObjects(string $uri): JSONResponse {
        $user = $this->session->getUser();
        if ($user === null) {
            return new JSONResponse(['message' => \PlainShow\Kit\Lang::t('Sign in to view this calendar.')], Http::STATUS_UNAUTHORIZED);
        }

        $principal = 'principals/users/' . $user->getUID();
        $subscription = $this->calDav->getSubscriptionByUri($principal, $uri);
        if ($subscription === null) {
            return new JSONResponse(['message' => \PlainShow\Kit\Lang::t('Calendar subscription not found.')], Http::STATUS_NOT_FOUND);
        }

        $objects = [];
        foreach ($this->calDav->getCalendarObjects($subscription['id'], CalDavBackend::CALENDAR_TYPE_SUBSCRIPTION) as $item) {
            $object = $this->calDav->getCalendarObject($subscription['id'], $item['uri'], CalDavBackend::CALENDAR_TYPE_SUBSCRIPTION);
            if ($object === null || ($object['component'] ?? '') !== 'vevent') {
                continue;
            }
            $objects[] = [
                'href' => $item['uri'],
                'etag' => $object['etag'] ?? '',
                'data' => $object['calendardata'] ?? '',
            ];
        }

        $response = new JSONResponse(['objects' => $objects]);
        $response->addHeader('Cache-Control', 'no-store');
        return $response;
    }
}
