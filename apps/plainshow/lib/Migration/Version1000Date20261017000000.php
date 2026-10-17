<?php

declare(strict_types=1);

namespace OCA\PlainShow\Migration;

use Closure;
use OCA\PlainShow\Removed;
use OCP\DB\ISchemaWrapper;
use OCP\IConfig;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * The tables of the removed apps go, and those of apps uninstalled long ago.
 * (The data inside kept tables is cleaned by Repair\Cleanup, which also runs
 * on install, when Nextcloud only applies the schema part of migrations.)
 */
class Version1000Date20261017000000 extends SimpleMigrationStep {
    public function __construct(
        private IConfig $config,
    ) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        $prefix = $this->config->getSystemValueString('dbtableprefix', 'oc_');
        $drop = Removed::TABLES;
        foreach ($schema->getTableNames() as $table) {
            $name = str_starts_with($table, $prefix) ? substr($table, strlen($prefix)) : $table;
            foreach (Removed::TABLE_FAMILIES as $family) {
                if (str_starts_with($name, $family)) {
                    $drop[] = $name;
                }
            }
        }
        foreach (array_unique($drop) as $table) {
            if ($schema->hasTable($table)) {
                $schema->dropTable($table);
                $output->info("Dropped $table");
            }
        }

        return $schema;
    }
}
