<?php

declare(strict_types=1);

namespace OCA\PlainShow\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * From Nextcloud to PlainShow Cloud: what the removed apps leave in the
 * database goes with them (tables, settings, migrations, background jobs),
 * and so does what apps uninstalled long ago left behind. Talk's chats and
 * room shares go with Talk. The photo albums become PlainShow's.
 */
class Version1000Date20261017000000 extends SimpleMigrationStep {
    /** Apps removed from the code, and apps uninstalled before that. */
    public const REMOVED_APPS = [
        'activity', 'admin_audit', 'app_api', 'appstore', 'bruteforcesettings', 'calendar', 'circles', 'cloud_federation_api',
        'comments', 'contacts', 'contactsinteraction', 'dashboard', 'encryption', 'federatedfilesharing', 'federation',
        'files_downloadlimit', 'files_external', 'files_pdfviewer', 'files_reminders', 'firstrunwizard', 'logreader',
        'lookup_server_connector', 'nextcloud_announcements', 'oauth2', 'office', 'password_policy', 'photos', 'privacy',
        'profile', 'recommendations', 'related_resources', 'serverinfo', 'sharebymail', 'spreed', 'support', 'survey_client',
        'suspicious_login', 'testing', 'text', 'twofactor_backupcodes', 'twofactor_nextcloud_notification', 'twofactor_totp',
        'twofactor_webauthn', 'updatenotification', 'user_ldap', 'user_migration', 'user_status', 'viewer', 'weather_status',
        'webhook_listeners', 'workflowengine',
        // Uninstalled earlier, tables left behind.
        'deck', 'facerecognition', 'hugetalkweb', 'mail', 'maps', 'money', 'music', 'news', 'onlyoffice', 'recognize',
        'side_menu', 'oidc_login', 'tasks',
    ];

    /** Tables of the removed apps, read from their migrations. */
    public const TABLES = [
        'activity', 'activity_mq',
        'appconfig_ex', 'preferences_ex', 'ex_apps', 'ex_apps_api_scopes', 'ex_apps_daemons', 'ex_apps_routes', 'ex_apps_scopes',
        'ex_apps_talk_bots', 'ex_apps_users', 'ex_deploy_options', 'ex_files_actions_menu', 'ex_occ_commands', 'ex_settings_forms',
        'ex_task_processing', 'ex_ui_files_actions', 'ex_ui_scripts', 'ex_ui_states', 'ex_ui_styles', 'ex_ui_top_menu',
        'calendar_appt_bookings', 'calendar_appt_configs', 'calendar_proposal_dats', 'calendar_proposal_dts', 'calendar_proposal_pts', 'calendar_proposal_vts',
        'circles_circle', 'circles_event', 'circles_member', 'circles_membership', 'circles_mount', 'circles_mountpoint',
        'circles_remote', 'circles_share_lock', 'circles_token',
        'recent_contact', 'federated_reshares', 'trusted_servers', 'shares_limits', 'files_reminders',
        'external_applicable', 'external_config', 'external_mounts', 'external_options',
        'oauth2_access_tokens', 'oauth2_clients', 'privacy_admins',
        'login_address', 'login_address_aggregated', 'login_ips_aggregated', 'suspicious_login', 'suspicious_login_model',
        'text_documents', 'text_sessions', 'text_steps',
        'twofactor_backupcodes', 'twofactor_tnn_tokens', 'twofactor_totp_secrets', 'twofactor_webauthn_registrations', 'twofactor_webauthn_regs',
        'ldap_group_mapping', 'ldap_group_mapping_backup', 'ldap_group_members', 'ldap_group_membership', 'ldap_user_mapping',
        'user_status', 'user_export_jobs', 'user_import_jobs', 'webhook_listeners', 'webhook_tokens',
        'flow_checks', 'flow_operations', 'flow_operations_scope',
        'spreedme_messages', 'spreedme_room_participants', 'spreedme_rooms', 'videocalls_signaling',
    ];

    /** Whole families of tables: Talk, and the apps uninstalled before. */
    public const TABLE_PREFIXES = ['talk_', 'deck_', 'mail_', 'music_', 'maps_', 'news_', 'facerecog_', 'recognize_', 'money_', 'onlyoffice_', 'htw_'];

    /** Namespaces of the apps that stay (appinfo/info.xml). */
    public const KEPT_NAMESPACES = ['DAV', 'Files', 'FilesLock', 'Files_Sharing', 'Files_Trashbin', 'Files_Versions', 'Notifications',
        'Provisioning_API', 'Settings', 'SystemTags', 'Theming', 'NotifyPush', 'UserOIDC', 'PlainShow'];

    /** The albums, under PlainShow's name. */
    public const RENAMES = [
        'photos_albums' => 'plainshow_albums',
        'photos_albums_files' => 'plainshow_album_files',
        'photos_albums_collabs' => 'plainshow_album_collabs',
        'photos_collaborators' => 'plainshow_album_collaborators',
    ];

    public function __construct(
        private IDBConnection $db,
    ) {
    }

    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $prefix = \OC::$server->getConfig()->getSystemValueString('dbtableprefix', 'oc_');
        $schema = $schemaClosure();
        foreach (self::RENAMES as $from => $to) {
            if ($schema->hasTable($from) && !$schema->hasTable($to)) {
                $this->db->executeStatement('RENAME TABLE `' . $prefix . $from . '` TO `' . $prefix . $to . '`');
                $output->info("Albums: $from is now $to");
            }
        }

        // Talk goes: its chats, reactions to them and the shares into its rooms.
        $this->delete('comments', 'object_type', ['chat']);
        $this->delete('comments_read_markers', 'object_type', ['chat']);
        $this->db->executeStatement('DELETE FROM `' . $prefix . 'reactions` WHERE `parent_id` NOT IN (SELECT `id` FROM `' . $prefix . 'comments`)');
        $this->delete('share', 'share_type', [10, 11, 12], IQueryBuilder::PARAM_INT_ARRAY);
        // Two-factor is PlainShow's job now; no provider may be left "enabled".
        $this->db->executeStatement('DELETE FROM `' . $prefix . 'twofactor_providers`');
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        $prefix = \OC::$server->getConfig()->getSystemValueString('dbtableprefix', 'oc_');
        $drop = self::TABLES;
        foreach ($schema->getTableNames() as $table) {
            $name = str_starts_with($table, $prefix) ? substr($table, strlen($prefix)) : $table;
            foreach (self::TABLE_PREFIXES as $family) {
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

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $apps = self::REMOVED_APPS;
        $this->delete('appconfig', 'appid', $apps);
        $this->delete('preferences', 'appid', $apps);
        $this->delete('migrations', 'app', $apps);

        // Background jobs of apps that are gone. Judged by namespace: during an
        // upgrade not every kept app is loaded, so class_exists would be wrong.
        $result = $this->db->getQueryBuilder()->select('id', 'class')->from('jobs')->executeQuery();
        $gone = [];
        while ($row = $result->fetch()) {
            $class = ltrim((string)$row['class'], '\\');
            $appGone = str_starts_with($class, 'OCA\\')
                ? !in_array(explode('\\', $class)[1] ?? '', self::KEPT_NAMESPACES, true)
                : !class_exists($class);
            if ($appGone) {
                $gone[] = (int)$row['id'];
            }
        }
        $result->closeCursor();
        foreach (array_chunk($gone, 500) as $ids) {
            $this->delete('jobs', 'id', $ids, IQueryBuilder::PARAM_INT_ARRAY);
        }
        $output->info(count($gone) . ' background jobs removed');
    }

    private function delete(string $table, string $column, array $values, int $type = IQueryBuilder::PARAM_STR_ARRAY): void {
        if ($values === []) {
            return;
        }
        $query = $this->db->getQueryBuilder();
        $query->delete($table)->where($query->expr()->in($column, $query->createNamedParameter($values, $type)))->executeStatement();
    }
}
