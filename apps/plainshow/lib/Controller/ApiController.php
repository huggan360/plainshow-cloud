<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\Actions;
use OCA\PlainShow\Service\Recent;
use OCA\PlainShow\Service\Signing;
use OCA\PlainShow\Service\Upcoming;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserManager;
use PlainShow\Kit\KitException;
use PlainShow\Kit\OpenApi;
use PlainShow\Kit\Platform;
use PlainShow\Kit\Signed;
use Throwable;

/**
 * Cloud API, version 1: plainshow.se/api/cloud/v1/... Reads your files,
 * photos and calendar for scripts using a personal PlainShow token, and lets
 * the dashboard's assistant add events and tasks and share files. Calls
 * arrive through Core's gateway, signed for the person and naming their Cloud
 * account (ps_cloud_uid); /health and /openapi.json are public.
 */
class ApiController extends Controller {
    private const ROUTES = [
        ['method' => 'GET', 'path' => '/health', 'capability' => null],
        ['method' => 'GET', 'path' => '/me', 'capability' => 'cloud.files.view'],
        ['method' => 'GET', 'path' => '/files', 'capability' => 'cloud.files.view'],
        ['method' => 'GET', 'path' => '/files/recent', 'capability' => 'cloud.files.view'],
        ['method' => 'GET', 'path' => '/files/download', 'capability' => 'cloud.files.view'],
        ['method' => 'GET', 'path' => '/photos', 'capability' => 'cloud.photos.view'],
        ['method' => 'GET', 'path' => '/events', 'capability' => 'cloud.calendar.view'],
        ['method' => 'GET', 'path' => '/calendars', 'capability' => 'cloud.calendar.view'],
        ['method' => 'POST', 'path' => '/events', 'capability' => 'cloud.calendar.edit'],
        ['method' => 'POST', 'path' => '/events/change', 'capability' => 'cloud.calendar.edit'],
        ['method' => 'POST', 'path' => '/events/remove', 'capability' => 'cloud.calendar.edit'],
        ['method' => 'POST', 'path' => '/tasks', 'capability' => 'cloud.calendar.edit'],
        ['method' => 'GET', 'path' => '/files/find', 'capability' => 'cloud.files.view'],
        ['method' => 'POST', 'path' => '/shares', 'capability' => 'cloud.files.share'],
    ];

    public function __construct(
        string $appName,
        IRequest $request,
        private Signing $signing,
        private IRootFolder $root,
        private IUserManager $users,
        private Recent $recent,
        private Upcoming $upcoming,
        private IAppManager $apps,
        private Actions $actions,
    ) {
        parent::__construct($appName, $request);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/health')]
    public function health(): JSONResponse {
        return $this->send(['ok' => true, 'service' => 'cloud', 'version' => $this->apps->getAppVersion('plainshow')]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/openapi.json')]
    public function openapi(): JSONResponse {
        $spec = OpenApi::build(self::ROUTES, [
            'GET /health' => ['summary' => 'Whether Cloud answers', 'returns' => 'The service name and version'],
            'GET /me' => ['summary' => 'Your Cloud account', 'description' => 'The account you act as, and how much of your space is used.'],
            'GET /files' => ['summary' => 'A folder', 'description' => 'What is in a folder of yours, folders first.', 'query' => ['path' => 'The folder, such as Photos/2026. Empty for your home folder.']],
            'GET /files/recent' => ['summary' => 'Recently changed files', 'query' => ['limit' => 'How many, up to 50 (default 20)']],
            'GET /files/download' => ['summary' => 'A file', 'description' => 'The file itself.', 'query' => ['path' => 'The file, such as Documents/plan.pdf']],
            'GET /photos' => ['summary' => 'Your latest photos and videos', 'query' => ['limit' => 'How many, up to 100 (default 30)']],
            'GET /events' => ['summary' => 'What is coming up', 'description' => 'Events in your calendars from today, repeats included.', 'query' => ['days' => 'How far ahead, up to 90 (default 14)']],
        ], ['title' => 'PlainShow Cloud', 'version' => $this->apps->getAppVersion('plainshow'), 'description' => 'Read your files, photos and calendar.'], Platform::require('core') . '/api/cloud/v1');
        $response = new JSONResponse($spec);
        $response->cacheFor(300);
        return $response;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/me')]
    public function me(): JSONResponse {
        [$account, $error] = $this->account(null);
        if ($error) {
            return $error;
        }
        $user = $this->users->get($account);
        $home = $this->root->getUserFolder($account);
        $quota = $user->getQuotaBytes();
        return $this->send(['ok' => true, 'account' => $account, 'name' => $user->getDisplayName(), 'used' => $home->getSize(), 'quota' => $quota === \OCP\Files\FileInfo::SPACE_UNLIMITED ? null : $quota]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/files')]
    public function files(string $path = ''): JSONResponse {
        [$account, $error] = $this->account();
        if ($error) {
            return $error;
        }
        $folder = $this->node($account, $path);
        if (!$folder instanceof Folder) {
            return $this->send(['ok' => false, 'message' => 'No such folder.'], Http::STATUS_NOT_FOUND);
        }
        $nodes = $folder->getDirectoryListing();
        usort($nodes, fn (Node $a, Node $b) => [$a instanceof File, strnatcasecmp($a->getName(), $b->getName())] <=> [$b instanceof File, 0]);
        $home = $this->root->getUserFolder($account);
        return $this->send(['ok' => true, 'path' => trim((string)$home->getRelativePath($folder->getPath()), '/'), 'items' => array_map(fn (Node $node) => $this->describe($home, $node), $nodes)]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/files/recent')]
    public function recentFiles(int $limit = 20): JSONResponse {
        [$account, $error] = $this->account();
        if ($error) {
            return $error;
        }
        return $this->send(['ok' => true, 'files' => $this->recent->files($account, max(1, min(50, $limit)))]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/files/download')]
    public function download(string $path = ''): Response {
        [$account, $error] = $this->account();
        if ($error) {
            return $error;
        }
        $file = $this->node($account, $path);
        if (!$file instanceof File) {
            return $this->send(['ok' => false, 'message' => 'No such file.'], Http::STATUS_NOT_FOUND);
        }
        $response = new StreamResponse($file->fopen('rb'));
        $response->addHeader('Content-Type', $file->getMimetype());
        $response->addHeader('Content-Disposition', 'attachment; filename="' . rawurlencode($file->getName()) . '"');
        return $response;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/photos')]
    public function photos(int $limit = 30): JSONResponse {
        [$account, $error] = $this->account('cloud.photos.view');
        if ($error) {
            return $error;
        }
        $home = $this->root->getUserFolder($account);
        return $this->send(['ok' => true, 'photos' => array_map(fn (File $file) => $this->describe($home, $file), $this->recent->photos($account, max(1, min(100, $limit))))]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/events')]
    public function events(int $days = 14): JSONResponse {
        [$account, $error] = $this->account('cloud.calendar.view');
        if ($error) {
            return $error;
        }
        return $this->send(['ok' => true, 'events' => $this->upcoming->events($account, max(1, min(90, $days)), 200)]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/calendars')]
    public function calendars(): JSONResponse {
        [$account, $error] = $this->account('cloud.calendar.view');
        return $error ?? $this->send(['ok' => true, 'calendars' => $this->actions->calendars($account)]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/v1/events')]
    public function addEvent(): JSONResponse {
        return $this->act('cloud.calendar.edit', fn (string $account, array $body) => ['event' => $this->actions->addEvent(
            $account, (int)($body['calendar'] ?? 0), (string)($body['title'] ?? ''), (string)($body['start'] ?? ''), (string)($body['end'] ?? ''), (bool)($body['allDay'] ?? false), (string)($body['place'] ?? ''),
        )]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/v1/events/change')]
    public function changeEvent(): JSONResponse {
        return $this->act('cloud.calendar.edit', fn (string $account, array $body) => ['event' => $this->actions->changeEvent(
            $account, (int)($body['calendar'] ?? 0), (string)($body['uid'] ?? ''), array_intersect_key($body, array_flip(['title', 'start', 'end', 'allDay', 'place'])),
        )]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/v1/events/remove')]
    public function removeEvent(): JSONResponse {
        return $this->act('cloud.calendar.edit', function (string $account, array $body) {
            $this->actions->removeEvent($account, (int)($body['calendar'] ?? 0), (string)($body['uid'] ?? ''));
            return [];
        });
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/v1/tasks')]
    public function addTask(): JSONResponse {
        return $this->act('cloud.calendar.edit', fn (string $account, array $body) => ['task' => $this->actions->addTask(
            $account, (int)($body['calendar'] ?? 0), (string)($body['title'] ?? ''), isset($body['due']) ? (string)$body['due'] : null,
        )]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/v1/files/find')]
    public function findFiles(string $kind = 'any', string $q = '', int $limit = 5): JSONResponse {
        [$account, $error] = $this->account('cloud.files.view');
        return $error ?? $this->send(['ok' => true, 'files' => $this->actions->files($account, $kind, mb_substr($q, 0, 100), max(1, min(20, $limit)))]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/v1/shares')]
    public function share(): JSONResponse {
        return $this->act('cloud.files.share', fn (string $account, array $body) => ['share' => $this->actions->share($account, (int)($body['file'] ?? 0), (string)($body['with'] ?? ''))]);
    }

    /** A call that changes something: checked like every call, then done with the JSON body. */
    private function act(string $capability, callable $action): JSONResponse {
        [$account, $error] = $this->account($capability, true);
        if ($error) {
            return $error;
        }
        $body = json_decode((string)file_get_contents('php://input'), true);
        try {
            return $this->send(['ok' => true] + $action($account, is_array($body) ? $body : []));
        } catch (Throwable $failure) {
            return $this->send(['ok' => false, 'message' => $failure->getMessage()], Http::STATUS_UNPROCESSABLE_ENTITY);
        }
    }

    /** @return array{0: ?string, 1: ?JSONResponse} the account to act as, or the answer to give */
    private function account(?string $capability = 'cloud.files.view', bool $write = false): array {
        if (!Signed::present($_SERVER)) {
            return [null, $this->send(['ok' => false, 'message' => 'Use ' . Platform::require('core') . '/api/cloud/v1 with a PlainShow API token.'], Http::STATUS_UNAUTHORIZED)];
        }
        try {
            $verified = Signed::verify($_SERVER, (string)file_get_contents('php://input'), $this->signing->secret());
        } catch (KitException $error) {
            return [null, $this->send(['ok' => false, 'message' => $error->getMessage()], Http::STATUS_UNAUTHORIZED)];
        }
        $identity = Signed::identity($verified);
        if (!$identity->hasService('cloud') || ($capability !== null && !$identity->can($capability))) {
            return [null, $this->send(['ok' => false, 'message' => 'You cannot use Cloud.'], Http::STATUS_FORBIDDEN)];
        }
        $account = (string)($verified['context']['ps_cloud_uid'] ?? '');
        if ($account === '' || !$this->users->userExists($account)) {
            return [null, $this->send(['ok' => false, 'message' => 'You have no Cloud account yet.'], Http::STATUS_NOT_FOUND)];
        }
        if ($this->request->getMethod() !== ($write ? 'POST' : 'GET')) {
            return [null, $this->send(['ok' => false, 'message' => $write ? 'Use POST.' : 'This part of the Cloud API only reads.'], Http::STATUS_METHOD_NOT_ALLOWED)];
        }
        return [$account, null];
    }

    private function node(string $account, string $path): ?Node {
        $path = trim(str_replace('\\', '/', $path), '/');
        if (preg_match('#(^|/)\.\.(/|$)#', $path)) {
            return null;
        }
        try {
            $home = $this->root->getUserFolder($account);
            return $path === '' ? $home : $home->get($path);
        } catch (NotFoundException) {
            return null;
        }
    }

    private function describe(Folder $home, Node $node): array {
        return [
            'id' => $node->getId(),
            'name' => $node->getName(),
            'path' => trim((string)$home->getRelativePath($node->getPath()), '/'),
            'type' => $node instanceof Folder ? 'folder' : $node->getMimetype(),
            'size' => $node->getSize(),
            'changedAt' => date(DATE_ATOM, $node->getMTime()),
        ];
    }

    private function send(array $body, int $status = Http::STATUS_OK): JSONResponse {
        $response = new JSONResponse($body, $status);
        $response->addHeader('Cache-Control', 'no-store');
        return $response;
    }
}
