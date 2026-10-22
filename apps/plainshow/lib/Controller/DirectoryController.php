<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\PlatformDirectory;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

class DirectoryController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $session,
        private PlatformDirectory $directory,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/directory')]
    public function index(): JSONResponse {
        $user = $this->session->getUser();
        if ($user === null) {
            return new JSONResponse(['message' => \PlainShow\Kit\Lang::t('Sign in again to continue.')], Http::STATUS_UNAUTHORIZED);
        }
        try {
            return new JSONResponse($this->directory->forAccount($user->getUID()));
        } catch (RuntimeException $error) {
            return new JSONResponse(['message' => $error->getMessage()], Http::STATUS_SERVICE_UNAVAILABLE);
        }
    }
}
