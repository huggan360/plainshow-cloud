<?php

declare(strict_types=1);

$configFile = $argv[1] ?? '';
if (!is_file($configFile)) {
    fwrite(STDERR, "Usage: php ops/data-snapshot.php <config.php> [scratch database]\n");
    exit(2);
}
require $configFile;
$database = $argv[2] ?? $CONFIG['dbname'];
$prefix = $CONFIG['dbtableprefix'] ?? 'oc_';
if (!preg_match('/^[a-zA-Z0-9_]+$/D', $database) || !preg_match('/^[a-zA-Z0-9_]+$/D', $prefix)) {
    throw new RuntimeException('Unexpected database identifier.');
}
$asRoot = ($argv[3] ?? '') === '--root';
if ($asRoot && posix_geteuid() !== 0) {
    throw new RuntimeException('Local root database access requires root.');
}
$connection = new PDO('mysql:host=' . ($asRoot ? 'localhost' : $CONFIG['dbhost']) . ';dbname=' . $database . ';charset=utf8mb4', $asRoot ? 'root' : $CONFIG['dbuser'], $asRoot ? '' : $CONFIG['dbpassword'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$tables = $connection->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$snapshot = [];
$definitions = [
    'users' => ['users', 'uid, displayname', ''],
    'accounts' => ['accounts', '*', ''],
    'calendars' => ['calendars', '*', ''],
    'calendarobjects' => ['calendarobjects', '*', ''],
    'calendarsubscriptions' => ['calendarsubscriptions', '*', ''],
    'addressbooks' => ['addressbooks', '*', ''],
    'cards' => ['cards', '*', ''],
    'shares' => ['share', '*', 'WHERE share_type NOT IN (10, 11, 12)'],
    'albums' => ['plainshow_albums|photos_albums', '*', ''],
    'album_files' => ['plainshow_album_files|photos_albums_files', '*', ''],
    'album_collaborators' => ['plainshow_album_collabs|photos_albums_collabs', '*', ''],
    'tags' => ['systemtag', '*', ''],
    'tag_links' => ['systemtag_object_mapping', '*', ''],
    'user_files' => ['filecache', '*', "WHERE storage IN (SELECT numeric_id FROM `{$prefix}storages` WHERE id LIKE 'home::%') AND (path = 'files' OR path LIKE 'files/%')"],
];
$connection->beginTransaction();
foreach ($definitions as $name => [$alternatives, $columns, $where]) {
    $table = null;
    foreach (explode('|', $alternatives) as $candidate) {
        if (in_array($prefix . $candidate, $tables, true)) {
            $table = $prefix . $candidate;
            break;
        }
    }
    if ($table === null) {
        throw new RuntimeException("Missing preserved table: $name");
    }
    $keys = $connection->query("SHOW KEYS FROM `$table` WHERE Key_name = 'PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
    $order = array_column($keys, 'Column_name');
    if (!$order) {
        $order = array_column($connection->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC), 'Field');
    }
    $orderBy = implode(', ', array_map(static fn (string $column): string => '`' . $column . '`', $order));
    $result = $connection->query("SELECT $columns FROM `$table` $where ORDER BY $orderBy");
    $hash = hash_init('sha256');
    $count = 0;
    while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
        ksort($row);
        hash_update($hash, serialize($row));
        $count++;
    }
    $snapshot[$name] = ['rows' => $count, 'sha256' => hash_final($hash)];
}
$connection->commit();
echo json_encode($snapshot, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), "\n";
