# NEXTCLOUD_AI_UPDATE_INSTRUCTIONS.md

## Viktigt

Denna Nextcloud ligger här:

/var/www/html/cloud

Domän:

cloud.weekofbali.org

Uppdatera INTE denna installation med Git:

git pull
git fetch origin
git rebase origin/master
git reset --hard origin/master

Använd INTE origin/master som uppdateringskälla.

Git används bara för lokal historik, lokala patchar och backup. Nextcloud ska uppdateras med Nextclouds egen updater.

## Normal Git-status

Det är okej om cloud visar:

## master...origin/master [ahead X]

Det betyder lokala patchar. De ska INTE pushas.

Skydda mot push:

cd /var/www/html/cloud
git remote set-url --push origin DISABLED
git remote -v

## Kontroll före ändring

Kör alltid detta först:

cd /var/www/html/cloud
sudo -u www-data php occ status
php -r 'include "version.php"; echo "code version: " . implode(".", $OC_Version) . PHP_EOL;'
git status -sb
git log --oneline --decorate -8
git submodule status 3rdparty
df -h /

Code version och occ-version måste matcha. Om databasen/config är 33.x får koden inte vara 32.x.

## Backup före update

cd /var/www/html/cloud
git branch backup/cloud-before-nextcloud-update-$(date +%F-%H%M)

mkdir -p ~/nextcloud-local-patches/$(date +%F-%H%M)
git format-patch origin/master..HEAD -o ~/nextcloud-local-patches/$(date +%F-%H%M)/ || true

Behåll denna backup tills vidare:

backup/cloud-before-update-2026-05-07-1657

## Rätt sätt att uppdatera Nextcloud

cd /var/www/html/cloud
sudo -E -u www-data php updater/updater.phar

Om det behövs efteråt:

sudo -E -u www-data php occ upgrade
sudo -E -u www-data php occ maintenance:mode --off
sudo systemctl reload apache2

Kontroll:

sudo -u www-data php occ status
curl -Ik https://cloud.weekofbali.org

## Om “Downgrading is not supported” visas

Ändra INTE config/config.php.
Försök INTE downgradera databasen.

Det betyder nästan alltid att koden är äldre än databasen/config.

Kontrollera:

cd /var/www/html/cloud
sudo -u www-data php occ status
php -r 'include "version.php"; echo "code version: " . implode(".", $OC_Version) . PHP_EOL;'

Återställ känd fungerande kod om nödvändigt:

git branch emergency/before-restore-$(date +%F-%H%M)
git reset --hard backup/cloud-before-update-2026-05-07-1657
git submodule update --init --checkout --force 3rdparty

sudo -u www-data php occ upgrade
sudo -u www-data php occ maintenance:mode --off
sudo systemctl reload apache2

## 3rdparty-submodule

Om git status visar:

M 3rdparty

Kör:

cd /var/www/html/cloud
git submodule status 3rdparty
git -C 3rdparty status -sb
git submodule update --init --checkout --force 3rdparty

Ren submodule börjar med mellanslag, inte +.

## Git-tempfiler efter avbruten fetch

Kolla:

cd /var/www/html/cloud
find .git/objects -maxdepth 2 -type f -name 'tmp_pack_*' -ls

Radera bara tydliga avbrutna tmp_pack-filer:

find .git/objects -maxdepth 2 -type f -name 'tmp_pack_*' -delete
git gc --prune=now
du -sh .git
df -h /

## Apache-koll

sudo apachectl configtest
sudo systemctl reload apache2
curl -Ik https://cloud.weekofbali.org

Om fel:

sudo journalctl -u apache2 -n 100 --no-pager
sudo tail -100 /var/log/apache2/error.log

## Huvudregel

Uppdatera Nextcloud med Nextcloud updater.
Använd Git bara för lokal historik och backup.
Använd aldrig origin/master för production-update.
Pusha aldrig cloud till origin.
