<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OC\Authentication\Exceptions\PasswordlessTokenException;
use OC\Authentication\Token\IProvider;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Authentication\Exceptions\InvalidTokenException;
use OCP\Authentication\Token\IToken;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IAppConfig;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Security\ISecureRandom;
use OCP\Share\IManager as ShareManager;
use OCP\Util;
use RuntimeException;

/**
 * Cloud's settings. For everyone: storage, devices and app passwords, sharing.
 * For admins (methods without NoAdminRequired): storage per person, link
 * sharing rules, how long trash and old versions are kept, background jobs.
 */
class SettingsController extends Controller {
    private const RETENTION = ['auto', 'auto, 7', 'auto, 30', 'auto, 90', 'auto, 365'];

    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $userSession,
        private ISession $session,
        private IProvider $tokens,
        private ISecureRandom $random,
        private IRootFolder $root,
        private IConfig $config,
        private IAppConfig $appConfig,
        private IUserManager $users,
        private ShareManager $shares,
        private IDBConnection $db,
    ) {
        parent::__construct($appName, $request);
    }

    private function me(): IUser {
        return $this->userSession->getUser();
    }

    private function answer(callable $work): JSONResponse {
        try {
            return new JSONResponse($work());
        } catch (RuntimeException $error) {
            return new JSONResponse(['message' => $error->getMessage()], Http::STATUS_BAD_REQUEST);
        }
    }

    /* ---------- You ---------- */

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/settings')]
    public function mine(): JSONResponse {
        $user = $this->me();
        $uid = $user->getUID();
        $files = $this->usedBy($uid);
        $quota = $user->getQuotaBytes();
        $size = function (string $folder) use ($uid): int {
            try {
                return (int)$this->root->get("/$uid/$folder")->getSize();
            } catch (NotFoundException) {
                return 0;
            }
        };
        return new JSONResponse([
            'storage' => [
                'files' => $files,
                'trash' => $size('files_trashbin'),
                'versions' => $size('files_versions'),
                'total' => is_int($quota) && $quota >= 0 ? $quota : null,
            ],
            'sharing' => [
                'accept' => $this->config->getUserValue($uid, 'files_sharing', 'default_accept', $this->config->getSystemValueBool('sharing.enable_share_accept', false) ? 'no' : 'yes') === 'yes',
                'acceptEnforced' => $this->config->getSystemValueBool('sharing.force_share_accept', false),
                'folder' => $this->config->getUserValue($uid, 'files_sharing', 'share_folder', $this->config->getSystemValue('share_folder', '/')),
                'folderAllowed' => $this->config->getSystemValueBool('sharing.allow_custom_share_folder', true),
            ],
            'rules' => $this->sharingRules(),
            'retention' => $this->retention(),
        ]);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PUT', url: '/api/web/settings/sharing')]
    public function sharing(?bool $accept = null, ?string $folder = null): JSONResponse {
        $uid = $this->me()->getUID();
        return $this->answer(function () use ($uid, $accept, $folder) {
            if ($accept !== null && !$this->config->getSystemValueBool('sharing.force_share_accept', false)) {
                $this->config->setUserValue($uid, 'files_sharing', 'default_accept', $accept ? 'yes' : 'no');
            }
            if ($folder !== null && $this->config->getSystemValueBool('sharing.allow_custom_share_folder', true)) {
                $folder = '/' . trim(str_replace('\\', '/', $folder), '/');
                if (str_contains($folder, '..') || mb_strlen($folder) > 200) {
                    throw new RuntimeException('That is not a folder name Cloud can use.');
                }
                if ($folder === '/') {
                    $this->config->deleteUserValue($uid, 'files_sharing', 'share_folder');
                } else {
                    $this->config->setUserValue($uid, 'files_sharing', 'share_folder', $folder);
                }
            }
            return ['ok' => true];
        });
    }

    /* ---------- Devices and app passwords ---------- */

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/settings/devices')]
    public function devices(): JSONResponse {
        $current = $this->currentTokenId();
        $list = array_values(array_filter(
            $this->tokens->getTokenByUser($this->me()->getUID()),
            fn (IToken $token) => $token->getType() !== IToken::ONETIME_TOKEN,
        ));
        usort($list, fn (IToken $a, IToken $b) => $b->getLastActivity() <=> $a->getLastActivity());
        return new JSONResponse(array_map(fn (IToken $token) => [
            'id' => $token->getId(),
            'name' => $token->getName(),
            'lastActivity' => $token->getLastActivity() * 1000,
            'kind' => $token->getType() === IToken::PERMANENT_TOKEN ? 'app' : 'browser',
            'current' => $token->getId() === $current,
        ], $list));
    }

    /** A new app password, shown once. Not from a device signed in with an app password. */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/web/settings/devices')]
    public function addDevice(string $name = ''): JSONResponse {
        return $this->answer(function () use ($name) {
            $name = trim($name);
            if ($name === '' || mb_strlen($name) > 120) {
                throw new RuntimeException('Give the device a name, up to 120 characters.');
            }
            if ($this->session->exists('app_password') || !$this->config->getSystemValueBool('auth_can_create_app_token', true)) {
                throw new RuntimeException('Make app passwords from a browser where you signed in to PlainShow.');
            }
            try {
                $sessionId = $this->session->getId();
                $sessionToken = $this->tokens->getToken($sessionId);
                $loginName = $sessionToken->getLoginName();
                try {
                    $password = $this->tokens->getPassword($sessionToken, $sessionId);
                } catch (PasswordlessTokenException) {
                    $password = null;
                }
            } catch (InvalidTokenException) {
                throw new RuntimeException('Your session could not be read. Sign in again and try once more.');
            }
            $groups = [];
            for ($i = 0; $i < 5; $i++) {
                $groups[] = $this->random->generate(5, ISecureRandom::CHAR_HUMAN_READABLE);
            }
            $secret = implode('-', $groups);
            $token = $this->tokens->generateToken($secret, $this->me()->getUID(), $loginName, $password, $name, IToken::PERMANENT_TOKEN);
            return [
                'loginName' => $loginName,
                'password' => $secret,
                'device' => ['id' => $token->getId(), 'name' => $token->getName(), 'lastActivity' => $token->getLastActivity() * 1000, 'kind' => 'app', 'current' => false],
            ];
        });
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/web/settings/devices/{id}')]
    public function removeDevice(int $id): JSONResponse {
        return $this->answer(function () use ($id) {
            if ($id === $this->currentTokenId()) {
                throw new RuntimeException('That is this browser. Sign out instead.');
            }
            try {
                $token = $this->tokens->getTokenById($id);
            } catch (\Throwable) {
                throw new RuntimeException('No such device.');
            }
            if ($token->getUID() !== $this->me()->getUID()) {
                throw new RuntimeException('No such device.');
            }
            $this->tokens->invalidateTokenById($this->me()->getUID(), $id);
            return ['ok' => true];
        });
    }

    private function currentTokenId(): ?int {
        try {
            return $this->tokens->getToken($this->session->getId())->getId();
        } catch (\Throwable) {
            return null;
        }
    }

    /* ---------- Admin ---------- */

    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/settings/admin')]
    public function admin(): JSONResponse {
        $people = [];
        $this->users->callForSeenUsers(function (IUser $user) use (&$people) {
            $people[] = [
                'id' => $user->getUID(),
                'name' => $user->getDisplayName(),
                'quota' => $user->getQuota(),
                'used' => $this->usedBy($user->getUID()),
                'lastLogin' => $user->getLastLogin() * 1000,
                'enabled' => $user->isEnabled(),
            ];
        });
        usort($people, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        return new JSONResponse([
            'people' => $people,
            'rules' => $this->sharingRules(),
            'retention' => $this->retention(),
            'jobs' => $this->jobs(),
            'free' => @disk_free_space($this->config->getSystemValueString('datadirectory', \OC::$SERVERROOT . '/data')) ?: null,
        ]);
    }

    #[FrontpageRoute(verb: 'PUT', url: '/api/web/settings/admin/quota')]
    public function quota(string $person, string $quota): JSONResponse {
        return $this->answer(function () use ($person, $quota) {
            $user = $this->users->get($person) ?? throw new RuntimeException('No such person.');
            $quota = trim($quota);
            if ($quota !== 'none' && $quota !== 'default') {
                $bytes = Util::computerFileSize($quota);
                if ($bytes === false || $bytes < 0) {
                    throw new RuntimeException('Write the size like 5 GB or 500 MB.');
                }
                $quota = Util::humanFileSize((int)$bytes);
            }
            $user->setQuota($quota);
            return ['quota' => $user->getQuota()];
        });
    }

    #[FrontpageRoute(verb: 'PUT', url: '/api/web/settings/admin/sharing')]
    public function rules(?bool $links = null, ?bool $passwordDefault = null, ?bool $passwordRequired = null, ?bool $expireDefault = null, ?bool $expireRequired = null, ?int $expireDays = null, ?bool $upload = null): JSONResponse {
        return $this->answer(function () use ($links, $passwordDefault, $passwordRequired, $expireDefault, $expireRequired, $expireDays, $upload) {
            if ($links !== null) {
                $this->config->setAppValue('core', 'shareapi_allow_links', $links ? 'yes' : 'no');
            }
            if ($upload !== null) {
                $this->config->setAppValue('core', 'shareapi_allow_public_upload', $upload ? 'yes' : 'no');
            }
            if ($passwordDefault !== null) {
                $this->appConfig->setValueBool('core', 'shareapi_enable_link_password_by_default', $passwordDefault);
            }
            if ($passwordRequired !== null) {
                $this->appConfig->setValueBool('core', 'shareapi_enforce_links_password', $passwordRequired);
            }
            if ($expireDefault !== null) {
                $this->appConfig->setValueBool('core', 'shareapi_default_expire_date', $expireDefault);
            }
            if ($expireRequired !== null) {
                $this->appConfig->setValueBool('core', 'shareapi_enforce_expire_date', $expireRequired);
            }
            if ($expireDays !== null) {
                if ($expireDays < 1 || $expireDays > 3650) {
                    throw new RuntimeException('Pick between 1 and 3650 days.');
                }
                $this->config->setAppValue('core', 'shareapi_expire_after_n_days', (string)$expireDays);
            }
            return $this->sharingRules();
        });
    }

    #[FrontpageRoute(verb: 'PUT', url: '/api/web/settings/admin/retention')]
    public function setRetention(?string $trash = null, ?string $versions = null): JSONResponse {
        return $this->answer(function () use ($trash, $versions) {
            foreach (['trashbin_retention_obligation' => $trash, 'versions_retention_obligation' => $versions] as $key => $value) {
                if ($value === null) {
                    continue;
                }
                if (!in_array($value, self::RETENTION, true)) {
                    throw new RuntimeException('Pick one of the choices.');
                }
                if ($value === 'auto') {
                    $this->config->deleteSystemValue($key);
                } else {
                    $this->config->setSystemValue($key, $value);
                }
            }
            return $this->retention();
        });
    }

    /* ---------- Helpers ---------- */

    /** Size of someone's files, from the file cache (no need to open their storage). */
    private function usedBy(string $uid): int {
        $q = $this->db->getQueryBuilder();
        $q->select('f.size')->from('filecache', 'f')
            ->innerJoin('f', 'storages', 's', $q->expr()->eq('s.numeric_id', 'f.storage'))
            ->where($q->expr()->in('s.id', $q->createNamedParameter(['home::' . $uid, 'object::user:' . $uid], \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR_ARRAY)))
            ->andWhere($q->expr()->eq('f.path_hash', $q->createNamedParameter(md5('files'))))
            ->setMaxResults(1);
        return max(0, (int)$q->executeQuery()->fetchOne());
    }

    private function sharingRules(): array {
        return [
            'links' => $this->config->getAppValue('core', 'shareapi_allow_links', 'yes') === 'yes',
            'upload' => $this->shares->shareApiLinkAllowPublicUpload(),
            'passwordDefault' => $this->appConfig->getValueBool('core', 'shareapi_enable_link_password_by_default'),
            'passwordRequired' => $this->appConfig->getValueBool('core', 'shareapi_enforce_links_password'),
            'expireDefault' => $this->shares->shareApiLinkDefaultExpireDate(),
            'expireRequired' => $this->shares->shareApiLinkDefaultExpireDateEnforced(),
            'expireDays' => $this->shares->shareApiLinkDefaultExpireDays(),
        ];
    }

    private function retention(): array {
        return [
            'trash' => (string)$this->config->getSystemValue('trashbin_retention_obligation', 'auto'),
            'versions' => (string)$this->config->getSystemValue('versions_retention_obligation', 'auto'),
            'choices' => self::RETENTION,
        ];
    }

    private function jobs(): array {
        $q = $this->db->getQueryBuilder();
        $q->select('id', 'class', 'last_run', 'last_checked', 'reserved_at', 'execution_duration', 'time_sensitive')->from('jobs')->orderBy('class');
        $now = time();
        $list = array_map(fn (array $row) => [
            'id' => (int)$row['id'],
            'name' => substr((string)$row['class'], (int)strrpos((string)$row['class'], '\\') + 1),
            'app' => explode('\\', ltrim((string)$row['class'], '\\'))[1] ?? '',
            'lastRun' => (int)$row['last_run'] * 1000,
            'duration' => (int)$row['execution_duration'],
            'stuck' => (int)$row['reserved_at'] > 0 && $now - (int)$row['reserved_at'] > 3600,
        ], $q->executeQuery()->fetchAll());
        return [
            'mode' => $this->config->getAppValue('core', 'backgroundjobs_mode', 'ajax'),
            'lastCron' => $this->appConfig->getValueInt('core', 'lastcron') * 1000,
            'list' => $list,
        ];
    }
}
