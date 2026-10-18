<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
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
        $base = rtrim($this->urls->linkToRoute('plainshow.page.index'), '/');
        $app = __DIR__ . '/../..';

        $response = new TemplateResponse('plainshow', 'main', [
            'boot' => [
                'base' => $base,
                'webroot' => \OC::$WEBROOT,
                'requestToken' => Util::callRegister(),
                'user' => [
                    'id' => $user->getUID(),
                    'name' => $user->getDisplayName(),
                    'email' => $user->getEMailAddress(),
                    'admin' => $this->groups->isAdmin($user->getUID()),
                    'avatar' => $this->urls->linkToRoute('core.avatar.getAvatar', ['userId' => $user->getUID(), 'size' => 64]),
                ],
                'quota' => ['used' => $home->getSize(), 'total' => $quota === FileInfo::SPACE_UNLIMITED ? null : $quota],
                'logout' => $this->urls->linkToRoute('core.login.logout', ['requesttoken' => Util::callRegister()]),
            ],
            'version' => substr(md5((string)@filemtime("$app/ui/css/plainshow.css")), 0, 10),
            'bundle' => $this->bundle($app),
        ], TemplateResponse::RENDER_AS_BLANK);

        $policy = new ContentSecurityPolicy();
        $policy->addAllowedImageDomain('blob:');
        $policy->addAllowedMediaDomain('blob:');
        $policy->addAllowedWorkerSrcDomain('blob:');
        $policy->addAllowedFrameDomain('blob:');
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
