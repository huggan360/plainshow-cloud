<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\Page;
use OCA\PlainShow\Service\WebRoutes;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\Files\IRootFolder;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

/**
 * PlainShow Cloud's pages: Files, Photos, Calendar and Settings are one app
 * in the browser; every address of it gets the same page and the app shows
 * the right part.
 */
class PageController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $session,
        private IGroupManager $groups,
        private IRootFolder $root,
        private IURLGenerator $urls,
        private Page $page,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/')]
    #[FrontpageRoute(verb: 'GET', url: '/files', postfix: 'files')]
    #[FrontpageRoute(verb: 'GET', url: '/files/{path}', requirements: ['path' => '.+'], postfix: 'files.path')]
    #[FrontpageRoute(verb: 'GET', url: '/recent', postfix: 'recent')]
    #[FrontpageRoute(verb: 'GET', url: '/favorites', postfix: 'favorites')]
    #[FrontpageRoute(verb: 'GET', url: '/shared/{tab}', postfix: 'shared')]
    #[FrontpageRoute(verb: 'GET', url: '/trash', postfix: 'trash')]
    #[FrontpageRoute(verb: 'GET', url: '/photos', postfix: 'photos')]
    #[FrontpageRoute(verb: 'GET', url: '/photos/{path}', requirements: ['path' => '.+'], postfix: 'photos.path')]
    #[FrontpageRoute(verb: 'GET', url: '/calendar', postfix: 'calendar')]
    #[FrontpageRoute(verb: 'GET', url: '/calendar/{path}', requirements: ['path' => '.+'], postfix: 'calendar.path')]
    #[FrontpageRoute(verb: 'GET', url: '/settings', postfix: 'settings')]
    #[FrontpageRoute(verb: 'GET', url: '/settings/{path}', requirements: ['path' => '.+'], postfix: 'settings.path')]
    public function index(): TemplateResponse {
        $user = $this->session->getUser();
        $home = $this->root->getUserFolder($user->getUID());
        $quota = $user->getQuotaBytes();
        return $this->page->render([
            'user' => [
                'id' => $user->getUID(),
                'name' => $user->getDisplayName(),
                'email' => $user->getEMailAddress(),
                'admin' => $this->groups->isAdmin($user->getUID()),
                'avatar' => $this->urls->linkToRoute('core.avatar.getAvatar', ['userId' => $user->getUID(), 'size' => 64]),
            ],
            'quota' => ['used' => $home->getSize(), 'total' => $quota === FileInfo::SPACE_UNLIMITED ? null : $quota],
            'logout' => $this->urls->linkToRoute('core.login.logout', ['requesttoken' => Util::callRegister()]),
        ]);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/legacy')]
    public function legacy(): RedirectResponse|NotFoundResponse {
        $path = $this->request->getRawPathInfo();
        $query = $this->request->getParams();
        $destination = WebRoutes::destination($path, $query);
        if ($destination === null) {
            return new NotFoundResponse();
        }
        $fileId = $query['fileid'] ?? null;
        if (preg_match('~^/(?:f|apps/files/files)/(\d+)/?$~D', $path, $matches)) {
            $fileId = $matches[1];
        }
        if ($fileId !== null && str_starts_with($destination, '/files') && is_scalar($fileId) && ctype_digit((string)$fileId)) {
            $home = $this->root->getUserFolder($this->session->getUser()->getUID());
            $nodes = $home->getById((int)$fileId);
            if (!$nodes) {
                return new NotFoundResponse();
            }
            $node = reset($nodes);
            $relative = $home->getRelativePath($node->getPath());
            if ($relative === null) {
                return new NotFoundResponse();
            }
            $folder = $node instanceof File ? dirname($relative) : $relative;
            $destination = '/files' . WebRoutes::filePath($folder === '.' ? '' : $folder);
            if ($node instanceof File) {
                $destination .= '?open=' . rawurlencode($node->getName());
            }
        }
        return new RedirectResponse(\OC::$WEBROOT . $destination);
    }
}
