<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\IUserManager;
use RuntimeException;

/**
 * Photo albums (the Photos app's albums, now PlainShow's: plainshow_albums).
 * An album is its owner's; people it is shared with (collaborators) can see
 * it and add their own photos. Each photo stays its owner's file.
 */
class Albums {
    public function __construct(
        private IDBConnection $db,
        private IRootFolder $root,
        private IUserManager $users,
    ) {
    }

    /** Albums you own or that are shared with you, newest first. */
    public function list(string $account): array {
        $shared = $this->db->getQueryBuilder();
        $shared->select('album_id')->from('plainshow_album_collabs')
            ->where($shared->expr()->eq('collaborator_id', $shared->createNamedParameter($account)))
            ->andWhere($shared->expr()->eq('collaborator_type', $shared->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
        $sharedIds = array_map('intval', $shared->executeQuery()->fetchAll(\PDO::FETCH_COLUMN));

        $q = $this->db->getQueryBuilder();
        $mine = $q->expr()->eq('a.user', $q->createNamedParameter($account));
        $q->select('a.album_id', 'a.name', 'a.user', 'a.created', 'a.location', 'a.last_added_photo')
            ->selectAlias($q->func()->count('af.album_file_id'), 'count')
            ->selectAlias($q->func()->max('af.file_id'), 'newest')
            ->from('plainshow_albums', 'a')
            ->leftJoin('a', 'plainshow_album_files', 'af', $q->expr()->eq('af.album_id', 'a.album_id'))
            ->where($sharedIds ? $q->expr()->orX($mine, $q->expr()->in('a.album_id', $q->createNamedParameter($sharedIds, IQueryBuilder::PARAM_INT_ARRAY))) : $mine)
            ->groupBy('a.album_id', 'a.name', 'a.user', 'a.created', 'a.location', 'a.last_added_photo')
            ->orderBy('a.created', 'DESC');
        return array_map(fn (array $row) => [
            'id' => (int)$row['album_id'],
            'name' => (string)$row['name'],
            'owner' => (string)$row['user'],
            'ownerName' => $this->users->getDisplayName((string)$row['user']) ?? (string)$row['user'],
            'mine' => $row['user'] === $account,
            'created' => (int)$row['created'] * 1000,
            'location' => (string)($row['location'] ?? ''),
            'count' => (int)$row['count'],
            'cover' => ((int)$row['last_added_photo'] > 0 ? (int)$row['last_added_photo'] : (int)$row['newest']) ?: null,
        ], $q->executeQuery()->fetchAll());
    }

    public function one(string $account, int $id): array {
        foreach ($this->list($account) as $album) {
            if ($album['id'] === $id) {
                return $album;
            }
        }
        throw new RuntimeException('No such album.');
    }

    public function create(string $account, string $name, string $location = ''): array {
        $q = $this->db->getQueryBuilder();
        $q->insert('plainshow_albums')->values([
            'name' => $q->createNamedParameter($this->cleanName($name)),
            'user' => $q->createNamedParameter($account),
            'created' => $q->createNamedParameter(time(), IQueryBuilder::PARAM_INT),
            'location' => $q->createNamedParameter($location),
            'last_added_photo' => $q->createNamedParameter(-1, IQueryBuilder::PARAM_INT),
        ])->executeStatement();
        return $this->one($account, $q->getLastInsertId());
    }

    public function update(string $account, int $id, ?string $name, ?string $location): array {
        $this->own($account, $id);
        $q = $this->db->getQueryBuilder();
        $q->update('plainshow_albums')->where($q->expr()->eq('album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
        if ($name !== null) {
            $q->set('name', $q->createNamedParameter($this->cleanName($name)));
        }
        if ($location !== null) {
            $q->set('location', $q->createNamedParameter(mb_substr(trim($location), 0, 255)));
        }
        $q->executeStatement();
        return $this->one($account, $id);
    }

    public function delete(string $account, int $id): void {
        $this->own($account, $id);
        foreach (['plainshow_album_files', 'plainshow_album_collabs', 'plainshow_albums'] as $table) {
            $q = $this->db->getQueryBuilder();
            $q->delete($table)->where($q->expr()->eq('album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)))->executeStatement();
        }
    }

    /** The photos in an album, newest added first. */
    public function photos(string $account, int $id): array {
        $this->one($account, $id);
        $q = $this->db->getQueryBuilder();
        $q->select('af.file_id', 'af.owner', 'af.added', 'f.name', 'f.etag', 'f.size', 'f.mtime', 'm.mimetype')
            ->selectAlias('i.meta_value_int', 'taken')
            ->from('plainshow_album_files', 'af')
            ->innerJoin('af', 'filecache', 'f', $q->expr()->eq('f.fileid', 'af.file_id'))
            ->innerJoin('f', 'mimetypes', 'm', $q->expr()->eq('m.id', 'f.mimetype'))
            ->leftJoin('f', 'files_metadata_index', 'i', $q->expr()->andX($q->expr()->eq('i.file_id', 'f.fileid'), $q->expr()->eq('i.meta_key', $q->createNamedParameter(Photos::TAKEN))))
            ->where($q->expr()->eq('af.album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->orderBy('taken', 'DESC')->addOrderBy('af.added', 'DESC');
        return array_map(fn (array $row) => [
            'id' => (int)$row['file_id'],
            'name' => (string)$row['name'],
            'mime' => (string)$row['mimetype'],
            'etag' => (string)$row['etag'],
            'size' => (int)$row['size'],
            'modified' => (int)$row['mtime'] * 1000,
            'taken' => ((int)($row['taken'] ?? 0) ?: (int)$row['mtime']) * 1000,
            'owner' => (string)$row['owner'],
            'mine' => $row['owner'] === $account,
        ], $q->executeQuery()->fetchAll());
    }

    /** Add some of your own photos to an album you can see. */
    public function add(string $account, int $id, array $fileIds): int {
        $this->one($account, $id);
        $home = $this->root->getUserFolder($account);
        $added = 0;
        foreach (array_unique(array_map('intval', $fileIds)) as $fileId) {
            $file = $home->getFirstNodeById($fileId);
            if (!$file instanceof File || !preg_match('#^(image|video)/#', $file->getMimetype())) {
                continue;
            }
            $exists = $this->db->getQueryBuilder();
            $exists->select('album_file_id')->from('plainshow_album_files')
                ->where($exists->expr()->eq('album_id', $exists->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
                ->andWhere($exists->expr()->eq('file_id', $exists->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));
            if ($exists->executeQuery()->fetchOne() !== false) {
                continue;
            }
            $q = $this->db->getQueryBuilder();
            $q->insert('plainshow_album_files')->values([
                'album_id' => $q->createNamedParameter($id, IQueryBuilder::PARAM_INT),
                'file_id' => $q->createNamedParameter($fileId, IQueryBuilder::PARAM_INT),
                'added' => $q->createNamedParameter(time(), IQueryBuilder::PARAM_INT),
                'owner' => $q->createNamedParameter($account),
            ])->executeStatement();
            $added++;
            $u = $this->db->getQueryBuilder();
            $u->update('plainshow_albums')->set('last_added_photo', $u->createNamedParameter($fileId, IQueryBuilder::PARAM_INT))
                ->where($u->expr()->eq('album_id', $u->createNamedParameter($id, IQueryBuilder::PARAM_INT)))->executeStatement();
        }
        return $added;
    }

    /** Take a photo out of an album: the album's owner, or whoever added it. */
    public function remove(string $account, int $id, int $fileId): void {
        $album = $this->one($account, $id);
        $q = $this->db->getQueryBuilder();
        $q->delete('plainshow_album_files')
            ->where($q->expr()->eq('album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->andWhere($q->expr()->eq('file_id', $q->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));
        if (!$album['mine']) {
            $q->andWhere($q->expr()->eq('owner', $q->createNamedParameter($account)));
        }
        $q->executeStatement();
    }

    /** A photo of an album you can see, as its owner's file. */
    public function file(string $account, int $id, int $fileId): File {
        foreach ($this->photos($account, $id) as $photo) {
            if ($photo['id'] === $fileId) {
                $file = $this->root->getUserFolder($photo['owner'])->getFirstNodeById($fileId);
                if ($file instanceof File) {
                    return $file;
                }
            }
        }
        throw new RuntimeException('No such photo in this album.');
    }

    /** People an album is shared with. */
    public function people(string $account, int $id): array {
        $this->one($account, $id);
        $q = $this->db->getQueryBuilder();
        $q->select('collaborator_id')->from('plainshow_album_collabs')
            ->where($q->expr()->eq('album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->andWhere($q->expr()->eq('collaborator_type', $q->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
        return array_map(fn ($uid) => ['id' => (string)$uid, 'name' => $this->users->getDisplayName((string)$uid) ?? (string)$uid], $q->executeQuery()->fetchAll(\PDO::FETCH_COLUMN));
    }

    public function share(string $account, int $id, string $person, bool $on): void {
        $this->own($account, $id);
        if ($person === $account || !$this->users->userExists($person)) {
            throw new RuntimeException('No such person.');
        }
        $q = $this->db->getQueryBuilder();
        $q->delete('plainshow_album_collabs')
            ->where($q->expr()->eq('album_id', $q->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->andWhere($q->expr()->eq('collaborator_id', $q->createNamedParameter($person)))
            ->executeStatement();
        if ($on) {
            $i = $this->db->getQueryBuilder();
            $i->insert('plainshow_album_collabs')->values([
                'album_id' => $i->createNamedParameter($id, IQueryBuilder::PARAM_INT),
                'collaborator_id' => $i->createNamedParameter($person),
                'collaborator_type' => $i->createNamedParameter(0, IQueryBuilder::PARAM_INT),
            ])->executeStatement();
        }
    }

    private function own(string $account, int $id): void {
        if (!$this->one($account, $id)['mine']) {
            throw new RuntimeException('Only the album\'s owner can do that.');
        }
    }

    private function cleanName(string $name): string {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('An album needs a name, up to 120 characters.');
        }
        return $name;
    }
}
