<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;

/**
 * Every picture and video someone owns, by when it was taken (the camera's
 * date, kept in the files metadata as photos-original_date_time), else by
 * when the file changed. Read straight from the file index: fast for tens of
 * thousands of photos.
 */
class Photos {
    public const TAKEN = 'photos-original_date_time';

    public function __construct(
        private IDBConnection $db,
        private IRootFolder $root,
    ) {
    }

    private function storage(string $account): int {
        return $this->root->getUserFolder($account)->getStorage()->getCache()->getNumericStorageId();
    }

    private function base(string $account): IQueryBuilder {
        $q = $this->db->getQueryBuilder();
        $q->from('filecache', 'f')
            ->innerJoin('f', 'mimetypes', 'm', $q->expr()->eq('m.id', 'f.mimetype'))
            ->leftJoin('f', 'files_metadata_index', 'i', $q->expr()->andX(
                $q->expr()->eq('i.file_id', 'f.fileid'),
                $q->expr()->eq('i.meta_key', $q->createNamedParameter(self::TAKEN)),
            ))
            ->where($q->expr()->eq('f.storage', $q->createNamedParameter($this->storage($account), IQueryBuilder::PARAM_INT)))
            ->andWhere($q->expr()->like('f.path', $q->createNamedParameter('files/%')))
            ->andWhere($q->expr()->orX(
                $q->expr()->like('m.mimetype', $q->createNamedParameter('image/%')),
                $q->expr()->like('m.mimetype', $q->createNamedParameter('video/%')),
            ));
        return $q;
    }

    /**
     * A page of the timeline, newest first. $before is the cursor from the
     * last page: "<taken>:<fileid>".
     *
     * @return array{items: list<array>, next: ?string}
     */
    public function page(string $account, ?string $before, int $limit = 200): array {
        $q = $this->base($account);
        $taken = 'COALESCE(i.meta_value_int, f.mtime)';
        $q->select('f.fileid', 'f.path', 'f.name', 'f.etag', 'f.mtime', 'f.size', 'm.mimetype')
            ->selectAlias($q->createFunction($taken), 'taken')
            ->orderBy('taken', 'DESC')->addOrderBy('f.fileid', 'DESC')
            ->setMaxResults($limit);
        if ($before !== null && preg_match('/^(-?\d+):(\d+)$/', $before, $m)) {
            $q->andWhere($q->expr()->orX(
                $q->expr()->lt($q->createFunction($taken), $q->createNamedParameter((int)$m[1], IQueryBuilder::PARAM_INT)),
                $q->expr()->andX(
                    $q->expr()->eq($q->createFunction($taken), $q->createNamedParameter((int)$m[1], IQueryBuilder::PARAM_INT)),
                    $q->expr()->lt('f.fileid', $q->createNamedParameter((int)$m[2], IQueryBuilder::PARAM_INT)),
                ),
            ));
        }
        $rows = $q->executeQuery()->fetchAll();
        $items = array_map(fn (array $row) => [
            'id' => (int)$row['fileid'],
            'path' => substr((string)$row['path'], strlen('files/')),
            'name' => (string)$row['name'],
            'mime' => (string)$row['mimetype'],
            'etag' => (string)$row['etag'],
            'size' => (int)$row['size'],
            'modified' => (int)$row['mtime'] * 1000,
            'taken' => (int)$row['taken'] * 1000,
        ], $rows);
        $last = end($rows);
        return ['items' => $items, 'next' => count($rows) === $limit && $last ? $last['taken'] . ':' . $last['fileid'] : null];
    }

    /** How many photos per month, newest first, for jumping through the timeline. */
    public function months(string $account): array {
        $q = $this->base($account);
        $month = "DATE_FORMAT(FROM_UNIXTIME(COALESCE(i.meta_value_int, f.mtime)), '%Y-%m')";
        $q->selectAlias($q->createFunction($month), 'month')
            ->selectAlias($q->func()->count('f.fileid'), 'count')
            ->groupBy('month')->orderBy('month', 'DESC');
        return array_map(fn (array $row) => ['month' => (string)$row['month'], 'count' => (int)$row['count']], $q->executeQuery()->fetchAll());
    }
}
