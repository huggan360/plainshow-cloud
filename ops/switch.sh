#!/bin/bash
# From Nextcloud to PlainShow Cloud, in place.
#   ops/switch.sh <install dir> <git ref>
# The install dir must already be a checkout of this repository at the old
# code (the baseline commit), with config/config.php and its data folder.
# Run as a user who may sudo to www-data. Leaves maintenance mode on if a step fails.
set -Eeuo pipefail
DIR=${1:?install dir}; REF=${2:?git ref}
BACKUP=${3:?verified backup directory}; CONFIRM=${4:-}
if [ "$CONFIRM" != --confirm-signout ]; then
    echo 'Refusing to switch without --confirm-signout. Every Cloud browser and device will be signed out.' >&2
    exit 2
fi
for file in nextcloud.sql.gz cloud-code.tgz config.php; do
    [ -s "$BACKUP/$file" ] || { echo "Missing backup: $BACKUP/$file" >&2; exit 2; }
done
gzip -t "$BACKUP/nextcloud.sql.gz" "$BACKUP/cloud-code.tgz"
cd "$DIR"
occ() { sudo -u www-data php occ "$@"; }

step() { echo "== $*"; }

step "Resolve the release before changing anything"
git fetch -q origin
TARGET=$(git rev-parse --verify "$REF^{commit}")
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Tracked files have local changes. Stop and reconcile them first.' >&2; exit 2; }
git show "$TARGET":.htaccess | grep -q 'plainshow-switching'
removed=$(git show "$TARGET":apps/plainshow/lib/Removed.php | sed -n "/REMOVED_APPS = \[/,/\];/p" | grep -o "'[a-z0-9_]*'" | tr -d "'")
enabled=$(occ app:list --enabled --output=json | php -r '$apps = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR); echo implode(" ", array_keys($apps["enabled"]));')
required=$(php -r '$apps = json_decode(file_get_contents("core/shipped.json"), true, 512, JSON_THROW_ON_ERROR); echo implode(" ", $apps["alwaysEnabled"] ?? []);')
failed() {
    local status=${1:-$?}
    trap - ERR INT TERM
    occ maintenance:mode --on >&2 || true
    echo "Switch failed. Maintenance remains on and .plainshow-switching remains in place. Restore using $BACKUP before reopening Cloud." >&2
    exit "$status"
}
trap failed ERR
trap 'failed 130' INT
trap 'failed 143' TERM

step "Maintenance mode on"
occ maintenance:mode --on
touch .plainshow-switching

step "Switch off the apps that go (on the old code, so they uninstall cleanly)"
for app in $removed; do
    case " $required " in *" $app "*) continue;; esac
    case " $enabled " in *" $app "*) occ app:disable "$app" 2>&1 | tail -1;; esac
done

step "Code: $TARGET"
git checkout -q "$TARGET"
git clean -fdq apps custom_apps
composer install --quiet --no-dev --no-interaction --working-dir apps/plainshow

step "Settings: no app store, no updates, no integrity check (this is a fork)"
occ config:system:set appstoreenabled --value=false --type=boolean
occ config:system:set updatechecker --value=false --type=boolean
occ config:system:set integrity.check.disabled --value=true --type=boolean
occ config:system:set upgrade.disable-web --value=true --type=boolean
occ config:system:set has_internet_connection --value=true --type=boolean
occ config:system:set defaultapp --value=plainshow

step "Clear PHP's caches (Nextcloud keeps its routes in APCu)"
sudo systemctl reload apache2

step "Upgrade and install PlainShow while HTTP remains blocked"
occ maintenance:mode --off
occ upgrade --no-interaction
occ app:enable plainshow
occ maintenance:repair --no-interaction | tail -3

step "PlainShow's name, colour and logos (the phone and desktop apps show them)"
occ theming:config name "PlainShow Cloud"
occ theming:config url "https://plainshow.se"
occ theming:config slogan "Your files, photos and calendar"
occ theming:config primary_color "#FC5000"
occ theming:config background backgroundColor
occ theming:config background_color "#151515"
occ theming:config logo "$DIR/apps/plainshow/img/plainshow-icon.png"
occ theming:config logoheader "$DIR/apps/plainshow/img/plainshow-logo.png"
occ theming:config favicon "$DIR/apps/plainshow/img/plainshow-icon.png"

step "Signing in is PlainShow's: Nextcloud passwords stop working and everyone signs in again"
occ config:app:set user_oidc allow_multiple_user_backends --value=0
occ config:system:set token_auth_enforced --value=true --type=boolean
for user in $(occ user:list --output=json | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)))"); do
    OC_PASS=$(openssl rand -base64 48) sudo -E -u www-data php occ user:resetpassword --password-from-env "$user" >/dev/null
done
echo "Every Nextcloud password replaced with a random one."
# A clean start: every device and browser signs in again, through PlainShow.
database=$(occ config:system:get dbname)
prefix=$(occ config:system:get dbtableprefix)
[[ "$database" =~ ^[a-zA-Z0-9_]+$ && "$prefix" =~ ^[a-zA-Z0-9_]+$ ]] || { echo 'Unexpected database identifier' >&2; false; }
sudo mariadb "$database" -e "DELETE FROM \`${prefix}authtoken\`"
echo "Everyone is signed out; devices sign in again with PlainShow."
occ status --output=json | php -r '$status = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR); exit(!($status["installed"] ?? false) || ($status["maintenance"] ?? true) || ($status["needsDbUpgrade"] ?? true) ? 1 : 0);'
rm .plainshow-switching
trap - ERR INT TERM
occ status
