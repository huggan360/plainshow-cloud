#!/bin/bash
# The engine, end to end, as the phone and desktop apps use it.
#   USER1=alice PASS1=... USER2=bob PASS2=... ops/smoke.sh https://cloud.example [-k]
# Works in a folder "plainshow-smoke" in USER1's files and removes it after.
# Prints one line per check and exits non-zero if any failed.
set -u
H=${1:?base url}; K=${2:-}
A="$USER1:$PASS1"; B="$USER2:$PASS2"
D="$H/remote.php/dav/files/$USER1/plainshow-smoke"
fails=0
code() { curl -s $K -o /dev/null -w '%{http_code}' "$@"; }
check() { # check "label" expected-code(s) curl-args...
    local label=$1 want=$2; shift 2
    local got; got=$(code "$@")
    if [[ " $want " == *" $got "* ]]; then printf '  ok    %-40s %s\n' "$label" "$got"
    else printf '  FAIL  %-40s %s (wanted %s)\n' "$label" "$got" "$want"; fails=$((fails+1)); fi
}
ocs() { curl -s $K -H "OCS-APIREQUEST: true" "$@"; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

echo "Server"
check "status.php" 200 "$H/status.php"
check "capabilities" 200 -u "$A" -H "OCS-APIREQUEST: true" "$H/ocs/v2.php/cloud/capabilities"
check "your account and quota" 200 -u "$A" -H "OCS-APIREQUEST: true" "$H/ocs/v1.php/cloud/user"

echo "Files"
check "new folder" 201 -u "$A" -X MKCOL "$D"
printf 'one' > "$tmp/a.txt"; check "upload" 201 -u "$A" -T "$tmp/a.txt" "$D/a.txt"
printf 'two' > "$tmp/a.txt"; check "overwrite (makes a version)" 204 -u "$A" -T "$tmp/a.txt" "$D/a.txt"
check "download" 200 -u "$A" "$D/a.txt"
check "list" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$D"
check "list with sharing state (the web app asks)" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/files/$USER1/" -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><oc:share-types/><oc:permissions/><nc:has-preview/><oc:favorite/></d:prop></d:propfind>'
check "old webdav address" 207 -u "$A" -X PROPFIND -H "Depth: 0" "$H/remote.php/webdav/"
check "copy" 201 -u "$A" -X COPY -H "Destination: $D/b.txt" "$D/a.txt"
check "move" 201 -u "$A" -X MOVE -H "Destination: $D/c.txt" "$D/b.txt"
fid=$(curl -s $K -u "$A" -X PROPFIND -H "Depth: 0" "$D/a.txt" -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' | grep -o '<oc:fileid>[0-9]*' | cut -d'>' -f2)
check "versions of a file" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/versions/$USER1/versions/$fid"
check "favourite" 207 -u "$A" -X PROPPATCH "$D/a.txt" -d '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:set><d:prop><oc:favorite>1</oc:favorite></d:prop></d:set></d:propertyupdate>'
check "search (photos timeline query)" 207 -u "$A" -X SEARCH -H "Content-Type: text/xml" "$H/remote.php/dav/" -d "<?xml version=\"1.0\"?><d:searchrequest xmlns:d=\"DAV:\" xmlns:oc=\"http://owncloud.org/ns\"><d:basicsearch><d:select><d:prop><oc:fileid/></d:prop></d:select><d:from><d:scope><d:href>/files/$USER1</d:href><d:depth>infinity</d:depth></d:scope></d:from><d:where><d:like><d:prop><d:getcontenttype/></d:prop><d:literal>image/%</d:literal></d:like></d:where><d:orderby/><d:limit><d:nresults>10</d:nresults></d:limit></d:basicsearch></d:searchrequest>"
up="$H/remote.php/dav/uploads/$USER1/smoke-$RANDOM"
check "chunked upload: start" 201 -u "$A" -X MKCOL -H "Destination: $D/big.bin" "$up"
head -c 6000000 /dev/urandom > "$tmp/p1"; head -c 1000 /dev/urandom > "$tmp/p2"
check "chunked upload: part 1" 201 -u "$A" -T "$tmp/p1" -H "Destination: $D/big.bin" "$up/00001"
check "chunked upload: part 2" 201 -u "$A" -T "$tmp/p2" -H "Destination: $D/big.bin" "$up/00002"
check "chunked upload: finish" "201 204" -u "$A" -X MOVE -H "Destination: $D/big.bin" -H "OC-Total-Length: 6001000" "$up/.file"
printf 'P' > "$tmp/x.png"; base64 -d > "$tmp/x.png" <<<'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
check "upload a picture" 201 -u "$A" -T "$tmp/x.png" "$D/x.png"
pid=$(curl -s $K -u "$A" -X PROPFIND -H "Depth: 0" "$D/x.png" -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' | grep -o '<oc:fileid>[0-9]*' | cut -d'>' -f2)
check "thumbnail" 200 -u "$A" "$H/index.php/core/preview?fileId=$pid&x=64&y=64"
check "avatar" 200 -u "$A" "$H/index.php/avatar/$USER1/64"

echo "Sharing"
share=$(ocs -u "$A" -X POST "$H/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json" -d "path=/plainshow-smoke/a.txt&shareType=0&shareWith=$USER2&permissions=1" | python3 -c "import json,sys;print(json.load(sys.stdin)['ocs']['data']['id'])" 2>/dev/null)
[ -n "$share" ] && echo "  ok    share with a person" || { echo "  FAIL  share with a person"; fails=$((fails+1)); }
check "the other person sees it" 200 -u "$B" -H "OCS-APIREQUEST: true" "$H/ocs/v2.php/apps/files_sharing/api/v1/shares?shared_with_me=true"
check "people search" 200 -u "$A" -H "OCS-APIREQUEST: true" "$H/ocs/v2.php/apps/files_sharing/api/v1/sharees?search=$USER2&itemType=file"
link=$(ocs -u "$A" -X POST "$H/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json" -d "path=/plainshow-smoke/a.txt&shareType=3&permissions=1" | python3 -c "import json,sys;print(json.load(sys.stdin)['ocs']['data']['token'])" 2>/dev/null)
check "public link page" 200 "$H/index.php/s/$link"
check "public link download" 200 -L "$H/index.php/s/$link/download"
check "public dav download" 200 -u "$link:" "$H/public.php/webdav/"
check "public dav (new)" 200 "$H/public.php/dav/files/$link/"
check "unshare" 200 -u "$A" -H "OCS-APIREQUEST: true" -X DELETE "$H/ocs/v2.php/apps/files_sharing/api/v1/shares/$share"

echo "Calendar and contacts"
cal="$H/remote.php/dav/calendars/$USER1/personal"
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PlainShow//Smoke//EN\r\nBEGIN:VEVENT\r\nUID:plainshow-smoke\r\nDTSTAMP:20261017T120000Z\r\nDTSTART:20261020T100000Z\r\nDTEND:20261020T110000Z\r\nSUMMARY:Smoke\r\nRRULE:FREQ=DAILY;COUNT=3\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Soon\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' > "$tmp/e.ics"
check "event: create" 201 -u "$A" -T "$tmp/e.ics" -H "Content-Type: text/calendar" "$cal/plainshow-smoke.ics"
check "event: list" 207 -u "$A" -X REPORT -H "Depth: 1" -H "Content-Type: application/xml" "$cal/" --data '<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"/></c:filter></c:calendar-query>'
check "calendars (phone sync)" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/calendars/$USER1/"
check "event: delete" 204 -u "$A" -X DELETE "$cal/plainshow-smoke.ics"
check "address books (phone sync)" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/addressbooks/users/$USER1/"
check "well-known caldav" "301 302 307 308" "$H/.well-known/caldav"

echo "Trash, tags, devices, notifications"
check "delete to trash" 204 -u "$A" -X DELETE "$D/c.txt"
check "trash list" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/trashbin/$USER1/trash"
check "tags" 207 -u "$A" -X PROPFIND -H "Depth: 1" "$H/remote.php/dav/systemtags/"
check "app sign-in, v2 (desktop)" 200 -X POST "$H/index.php/login/v2"
check "app sign-in, v1 (phones)" 200 -H "OCS-APIREQUEST: true" "$H/index.php/login/flow"
check "device password (403 when already using one)" "200 403" -u "$A" -H "OCS-APIREQUEST: true" "$H/ocs/v2.php/core/getapppassword"
check "notifications" 200 -u "$A" -H "OCS-APIREQUEST: true" "$H/ocs/v2.php/apps/notifications/api/v2/notifications"

check "clean up" 204 -u "$A" -X DELETE "$D"
echo
[ $fails -eq 0 ] && echo "All checks passed." || echo "$fails check(s) failed."
exit $fails
