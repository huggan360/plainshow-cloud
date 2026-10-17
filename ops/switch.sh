#!/bin/bash
# From Nextcloud to PlainShow Cloud, in place.
#   ops/switch.sh <install dir> <git ref>
# The install dir must already be a checkout of this repository at the old
# code (the baseline commit), with config/config.php and its data folder.
# Run as a user who may sudo to www-data. Leaves maintenance mode on if a step fails.
set -euo pipefail
DIR=${1:?install dir}; REF=${2:?git ref}
cd "$DIR"
occ() { sudo -u www-data php occ "$@"; }

step() { echo "== $*"; }

step "Maintenance mode on"
occ maintenance:mode --on

step "Switch off the apps that go (on the old code, so they uninstall cleanly)"
removed=$(git show "$REF":apps/plainshow/lib/Removed.php | sed -n "/REMOVED_APPS = \[/,/\];/p" | grep -o "'[a-z0-9_]*'" | tr -d "'")
enabled=$(occ maintenance:mode --off >/dev/null; occ app:list --enabled --output=json | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)['enabled']))"; occ maintenance:mode --on >/dev/null)
for app in $removed; do
    case " $enabled " in *" $app "*) occ app:disable "$app" 2>&1 | tail -1 || true;; esac
done

step "Code: $REF"
git fetch -q origin 2>/dev/null || true
git checkout -q "$REF"
git clean -fdq apps custom_apps
composer install --quiet --no-dev --no-interaction --working-dir apps/plainshow

step "Settings: no app store, no updates, no integrity check (this is a fork)"
occ config:system:set appstoreenabled --value=false --type=boolean
occ config:system:set updatechecker --value=false --type=boolean
occ config:system:set integrity.check.disabled --value=true --type=boolean
occ config:system:set upgrade.disable-web --value=true --type=boolean
occ config:system:set has_internet_connection --value=true --type=boolean

step "Clear PHP's caches (Nextcloud keeps its routes in APCu)"
sudo systemctl reload apache2

step "Maintenance mode off, upgrade, PlainShow app (runs the cleanup)"
occ maintenance:mode --off
occ upgrade --no-interaction || true
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

step "Signing in is PlainShow's: Nextcloud passwords stop working, device passwords stay"
occ config:app:set user_oidc allow_multiple_user_backends --value=0
occ config:system:set token_auth_enforced --value=true --type=boolean
for user in $(occ user:list --output=json | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)))"); do
    OC_PASS=$(openssl rand -base64 48) sudo -E -u www-data php occ user:resetpassword --password-from-env "$user" >/dev/null
done
echo "Every Nextcloud password replaced with a random one."
# Device passwords of the Talk app are of no use without Talk.
sudo mariadb "$(occ config:system:get dbname)" -e "DELETE FROM $(occ config:system:get dbtableprefix)authtoken WHERE name LIKE '%Nextcloud Talk%' OR name LIKE '%Nextcloud-Talk%'"
occ status
