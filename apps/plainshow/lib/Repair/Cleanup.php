<?php

declare(strict_types=1);

namespace OCA\PlainShow\Repair;

use OCA\PlainShow\Removed;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * From Nextcloud to PlainShow Cloud. The removed apps' tables go, and so do
 * their settings, migrations and background jobs; Talk's chats and room
 * shares go with Talk; no two-factor provider is left switched on; the photo
 * albums become PlainShow's. Safe to run again.
 */
class Cleanup implements IRepairStep {
    public function __construct(
        private IDBConnection $db,
        private IConfig $config,
    ) {
    }

    public function getName(): string {
        return 'PlainShow Cloud: clean up after the removed apps';
    }

    public function run(IOutput $output): void {
        $prefix = $this->config->getSystemValueString('dbtableprefix', 'oc_');
        $this->dropTables($prefix, $output);
        foreach (Removed::RENAMES as $from => $to) {
            if ($this->db->tableExists($from) && !$this->db->tableExists($to)) {
                $this->db->executeStatement('RENAME TABLE `' . $prefix . $from . '` TO `' . $prefix . $to . '`');
                $output->info("Albums: $from is now $to");
            }
        }

        $this->delete('comments', 'object_type', ['chat']);
        $this->delete('comments_read_markers', 'object_type', ['chat']);
        $this->db->executeStatement('DELETE FROM `' . $prefix . 'reactions` WHERE `parent_id` NOT IN (SELECT `id` FROM `' . $prefix . 'comments`)');
        $this->delete('share', 'share_type', [10, 11, 12], IQueryBuilder::PARAM_INT_ARRAY);
        $this->db->executeStatement('DELETE FROM `' . $prefix . 'twofactor_providers`');

        $this->delete('appconfig', 'appid', Removed::REMOVED_APPS);
        $this->delete('preferences', 'appid', Removed::REMOVED_APPS);
        $this->delete('migrations', 'app', Removed::REMOVED_APPS);

        // Background jobs of apps that are gone. Judged by namespace: during an
        // upgrade not every kept app is loaded, so class_exists would be wrong.
        $result = $this->db->getQueryBuilder()->select('id', 'class')->from('jobs')->executeQuery();
        $gone = [];
        while ($row = $result->fetch()) {
            $class = ltrim((string)$row['class'], '\\');
            $appGone = str_starts_with($class, 'OCA\\')
                ? !in_array(explode('\\', $class)[1] ?? '', Removed::KEPT_NAMESPACES, true)
                : !class_exists($class);
            if ($appGone) {
                $gone[] = (int)$row['id'];
            }
        }
        $result->closeCursor();
        foreach (array_chunk($gone, 500) as $ids) {
            $this->delete('jobs', 'id', $ids, IQueryBuilder::PARAM_INT_ARRAY);
        }
        $output->info(count($gone) . ' background jobs of removed apps deleted');
    }

    /**
     * The removed apps' tables, and whole families of them. Some old apps'
     * tables point at each other in a circle, so foreign key checks are
     * paused for the drops (PlainShow Cloud runs on MariaDB).
     */
    private function dropTables(string $prefix, IOutput $output): void {
        $drop = [];
        foreach ($this->db->executeQuery('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN) as $table) {
            if (!str_starts_with($table, $prefix)) {
                continue;
            }
            $name = substr($table, strlen($prefix));
            $family = array_filter(Removed::TABLE_FAMILIES, fn (string $start) => str_starts_with($name, $start));
            if (in_array($name, Removed::TABLES, true) || $family !== []) {
                $drop[] = $table;
            }
        }
        if ($drop === []) {
            return;
        }
        $this->db->executeStatement('SET FOREIGN_KEY_CHECKS = 0');
        try {
            foreach ($drop as $table) {
                $this->db->executeStatement('DROP TABLE IF EXISTS `' . $table . '`');
            }
        } finally {
            $this->db->executeStatement('SET FOREIGN_KEY_CHECKS = 1');
        }
        $output->info(count($drop) . ' tables of removed apps dropped');
    }

    private function delete(string $table, string $column, array $values, int $type = IQueryBuilder::PARAM_STR_ARRAY): void {
        $query = $this->db->getQueryBuilder();
        $query->delete($table)->where($query->expr()->in($column, $query->createNamedParameter($values, $type)))->executeStatement();
    }
}
