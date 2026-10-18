<?php

declare(strict_types=1);

namespace OCA\PlainShow\Controller;

use OCA\PlainShow\Service\Albums;
use OCA\PlainShow\Service\Photos;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\IPreview;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;
use Throwable;

/** The Photos page: the timeline and albums, for the person signed in. */
class PhotosController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $session,
        private Photos $photos,
        private Albums $albums,
        private IPreview $previews,
    ) {
        parent::__construct($appName, $request);
    }

    private function me(): string {
        return $this->session->getUser()->getUID();
    }

    private function answer(callable $work): JSONResponse {
        try {
            return new JSONResponse($work());
        } catch (RuntimeException $error) {
            return new JSONResponse(['message' => $error->getMessage()], Http::STATUS_BAD_REQUEST);
        }
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/photos')]
    public function timeline(?string $before = null, int $limit = 200): JSONResponse {
        return new JSONResponse($this->photos->page($this->me(), $before, max(20, min(500, $limit))));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/photos/months')]
    public function months(): JSONResponse {
        return new JSONResponse($this->photos->months($this->me()));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/albums')]
    public function albums(): JSONResponse {
        return new JSONResponse($this->albums->list($this->me()));
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/web/albums')]
    public function create(string $name, string $location = ''): JSONResponse {
        return $this->answer(fn () => $this->albums->create($this->me(), $name, $location));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/albums/{id}')]
    public function album(int $id): JSONResponse {
        return $this->answer(fn () => [
            'album' => $this->albums->one($this->me(), $id),
            'photos' => $this->albums->photos($this->me(), $id),
            'people' => $this->albums->people($this->me(), $id),
        ]);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PUT', url: '/api/web/albums/{id}')]
    public function update(int $id, ?string $name = null, ?string $location = null): JSONResponse {
        return $this->answer(fn () => $this->albums->update($this->me(), $id, $name, $location));
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/web/albums/{id}')]
    public function delete(int $id): JSONResponse {
        return $this->answer(function () use ($id) { $this->albums->delete($this->me(), $id); return ['ok' => true]; });
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/web/albums/{id}/photos')]
    public function add(int $id, array $ids = []): JSONResponse {
        return $this->answer(fn () => ['added' => $this->albums->add($this->me(), $id, $ids)]);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/web/albums/{id}/photos/{fileId}')]
    public function remove(int $id, int $fileId): JSONResponse {
        return $this->answer(function () use ($id, $fileId) { $this->albums->remove($this->me(), $id, $fileId); return ['ok' => true]; });
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/web/albums/{id}/people')]
    public function share(int $id, string $person, bool $on = true): JSONResponse {
        return $this->answer(function () use ($id, $person, $on) { $this->albums->share($this->me(), $id, $person, $on); return $this->albums->people($this->me(), $id); });
    }

    /** A photo of an album, also when it is someone else's file (a shared album). */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/web/albums/{id}/photos/{fileId}')]
    public function photo(int $id, int $fileId, int $size = 0): Response {
        try {
            $file = $this->albums->file($this->me(), $id, $fileId);
            if ($size > 0) {
                $preview = $this->previews->getPreview($file, min($size, 2048), min($size, 2048), $size <= 256);
                $response = new FileDisplayResponse($preview, Http::STATUS_OK, ['Content-Type' => $preview->getMimeType()]);
            } else {
                $response = new StreamResponse($file->fopen('rb'));
                $response->addHeader('Content-Type', $file->getMimetype());
                $response->addHeader('Content-Disposition', 'inline; filename="' . rawurlencode($file->getName()) . '"');
            }
            $response->cacheFor(3600, false, true);
            return $response;
        } catch (Throwable) {
            return new Response(Http::STATUS_NOT_FOUND);
        }
    }
}
