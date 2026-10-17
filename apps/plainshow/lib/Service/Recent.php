<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use OC\Files\Search\SearchBinaryOperator;
use OC\Files\Search\SearchComparison;
use OC\Files\Search\SearchOrder;
use OC\Files\Search\SearchQuery;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\Search\ISearchBinaryOperator;
use OCP\Files\Search\ISearchComparison;
use OCP\Files\Search\ISearchOrder;
use OCP\IURLGenerator;
use OCP\IUserManager;

/** Recently changed files, and the latest photos and videos, of one account. */
class Recent {
    public function __construct(
        private IRootFolder $root,
        private IURLGenerator $urls,
        private IUserManager $users,
    ) {
    }

    /** @return list<array{name: string, folder: ?string, type: string, changed: string, url: string}> */
    public function files(string $account, int $limit = 10): array {
        $home = $this->root->getUserFolder($account);
        $files = [];
        foreach ($home->getRecent($limit) as $node) {
            if (!$node instanceof File) {
                continue;
            }
            $folder = trim(dirname($home->getRelativePath($node->getPath()) ?? ''), '/.');
            $files[] = [
                'name' => $node->getName(),
                'folder' => $folder !== '' ? $folder : null,
                'type' => $node->getMimetype(),
                'changed' => date(DATE_ATOM, $node->getMTime()),
                'url' => $this->urls->getAbsoluteURL('/index.php/f/' . $node->getId()),
            ];
        }
        return $files;
    }

    /** @return list<File> the newest pictures and videos, by when they were changed */
    public function photos(string $account, int $limit = 12): array {
        $home = $this->root->getUserFolder($account);
        $query = new SearchQuery(
            new SearchBinaryOperator(ISearchBinaryOperator::OPERATOR_OR, [
                new SearchComparison(ISearchComparison::COMPARE_LIKE, 'mimetype', 'image/%'),
                new SearchComparison(ISearchComparison::COMPARE_LIKE, 'mimetype', 'video/%'),
            ]),
            $limit, 0, [new SearchOrder(ISearchOrder::DIRECTION_DESCENDING, 'mtime')], $this->users->get($account),
        );
        return array_values(array_filter($home->search($query), fn ($node) => $node instanceof File));
    }
}
