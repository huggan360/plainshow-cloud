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
    private string $prefix;

    public function __construct(IConfig $config) {
        $this->prefix = $config->getSystemValueString('dbtableprefix', 'oc_');
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        $drop = Removed::TABLES;
        foreach ($schema->getTableNames() as $qualified) {
            // DBAL names tables "database.prefix_table".
            $name = substr($qualified, strrpos($qualified, '.') === false ? 0 : strrpos($qualified, '.') + 1);
            $name = str_starts_with($name, $this->prefix) ? substr($name, strlen($this->prefix)) : $name;
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
