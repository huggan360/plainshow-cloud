<?php

declare(strict_types=1);

namespace OCA\PlainShow;

/** What goes when Nextcloud becomes PlainShow Cloud: used by the migration and the repair step. */
final class Removed {
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
    public const TABLE_FAMILIES = ['talk_', 'deck_', 'mail_', 'music_', 'maps_', 'news_', 'facerecog_', 'recognize_', 'money_', 'onlyoffice_', 'htw_'];

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
}
