<?php

declare(strict_types=1);

namespace OCA\PlainShow\Share;

use OCA\PlainShow\Service\Page;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Constants;
use OCP\Files\File;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\Share\IPublicShareTemplateProvider;
use OCP\Share\IShare;

/**
 * What a share link (/s/{token}) shows: Cloud's own page instead of
 * Nextcloud's. files_sharing still checks the link, its password and its end
 * date before it asks us; the page then reads the share over public WebDAV.
 */
class PublicPage implements IPublicShareTemplateProvider {
    public function __construct(
        private Page $page,
        private IUserManager $users,
        private IURLGenerator $urls,
    ) {
    }

    public function shouldRespond(IShare $share): bool {
        return true;
    }

    public function renderPage(IShare $share, string $token, string $path): TemplateResponse {
        $node = $share->getNode();
        $owner = $this->users->get($share->getShareOwner());
        $permissions = $share->getPermissions();
        $file = $node instanceof File;
        $name = $share->getLabel() !== '' ? $share->getLabel() : $node->getName();
        $ownerName = $owner?->getDisplayName() ?? '';

        $meta = [
            'og:title' => $name,
            'og:description' => $ownerName !== '' ? "Shared by $ownerName on PlainShow Cloud" : 'Shared on PlainShow Cloud',
            'og:site_name' => 'PlainShow Cloud',
            'og:type' => 'object',
            'og:url' => $this->urls->linkToRouteAbsolute('files_sharing.sharecontroller.showShare', ['token' => $token]),
        ];
        if ($file && !$share->getHideDownload() && str_starts_with($node->getMimetype(), 'image/')) {
            $meta['og:image'] = $this->urls->linkToRouteAbsolute('files_sharing.PublicPreview.getPreview', ['token' => $token, 'x' => 1200, 'y' => 630, 'a' => 'true']);
        }

        return $this->page->render([
            'user' => ['id' => '', 'name' => '', 'email' => null, 'admin' => false, 'avatar' => ''],
            'quota' => ['used' => 0, 'total' => null],
            'logout' => '',
            'public' => [
                'token' => $token,
                'name' => $name,
                'owner' => $ownerName,
                'folder' => !$file,
                'canRead' => ($permissions & Constants::PERMISSION_READ) !== 0,
                'canUpload' => !$file && ($permissions & Constants::PERMISSION_CREATE) !== 0,
                'canEdit' => ($permissions & Constants::PERMISSION_UPDATE) !== 0,
                'hideDownload' => $share->getHideDownload(),
                'note' => $share->getNote(),
                'expires' => $share->getExpirationDate()?->getTimestamp() * 1000 ?: null,
                'mime' => $node->getMimetype(),
                'size' => (int)$node->getSize(),
                'path' => $path,
            ],
        ], "$name | PlainShow Cloud", $meta);
    }
}
