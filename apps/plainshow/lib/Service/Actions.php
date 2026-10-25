<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use DateTimeImmutable;
use DateTimeZone;
use OCA\DAV\CalDAV\CalDavBackend;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use RuntimeException;
use Sabre\CalDAV\Xml\Property\SupportedCalendarComponentSet;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

/**
 * What the dashboard's assistant may do in someone's Cloud, as that person:
 * make a calendar or task list, add, change and remove calendar events, add tasks, find files and share a
 * file with someone. Every call names the account it acts for; Core has
 * checked who asked and what they may do.
 */
class Actions {
    private const ZONE = 'Europe/Stockholm';

    public function __construct(
        private CalDavBackend $calDav,
        private IRootFolder $root,
        private IUserManager $users,
        private ShareManager $shares,
        private IURLGenerator $urls,
    ) {
    }

    /** @return list<array{id: int, name: string, color: ?string, events: bool, tasks: bool}> calendars the person can write to */
    public function calendars(string $account): array {
        $list = [];
        foreach ($this->calDav->getCalendarsForUser('principals/users/' . $account) as $calendar) {
            if (!empty($calendar['{http://owncloud.org/ns}read-only']) || str_starts_with((string)$calendar['uri'], 'contact_birthdays')) {
                continue;
            }
            $components = $calendar['{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set'] ?? null;
            $set = $components !== null ? $components->getValue() : ['VEVENT', 'VTODO'];
            $list[] = [
                'id' => (int)$calendar['id'],
                'name' => (string)($calendar['{DAV:}displayname'] ?? $calendar['uri']),
                'color' => ((string)($calendar['{http://apple.com/ns/ical/}calendar-color'] ?? '')) ?: null,
                'events' => in_array('VEVENT', $set, true),
                'tasks' => in_array('VTODO', $set, true),
            ];
        }
        return $list;
    }

    /** The colours the Calendar offers for a new calendar (src/calendar/Calendar.tsx). */
    private const COLORS = ['#FC5000', '#E5534B', '#F5B301', '#2EA043', '#14B8A6', '#3B82F6', '#8E7CF0', '#DB2777', '#8A8A8A'];

    /** A new calendar (or task list), as the Calendar makes one; a name already used gives the one there. */
    public function createCalendar(string $account, string $name, string $color, string $kind): array {
        $name = trim(mb_substr($name, 0, 100));
        if ($name === '') {
            throw new RuntimeException('A calendar needs a name.');
        }
        $kind = $kind === 'tasks' ? 'tasks' : 'events';
        foreach ($this->calendars($account) as $calendar) {
            if ($calendar[$kind] && mb_strtolower($calendar['name']) === mb_strtolower($name)) {
                return $calendar + ['already' => true, 'url' => $this->urls->getAbsoluteURL('/apps/plainshow/calendar')];
            }
        }
        $color = in_array(strtoupper($color), self::COLORS, true) ? strtoupper($color) : self::COLORS[random_int(0, count(self::COLORS) - 1)];
        $slug = trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower((string)iconv('UTF-8', 'ASCII//TRANSLIT', $name))), '-') ?: 'calendar';
        $id = $this->calDav->createCalendar('principals/users/' . $account, $slug . '-' . substr(bin2hex(random_bytes(4)), 0, 5), [
            '{DAV:}displayname' => $name,
            '{http://apple.com/ns/ical/}calendar-color' => $color,
            '{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set' => new SupportedCalendarComponentSet([$kind === 'tasks' ? 'VTODO' : 'VEVENT']),
        ]);
        return [
            'id' => (int)$id, 'name' => $name, 'color' => $color, 'events' => $kind === 'events', 'tasks' => $kind === 'tasks', 'already' => false,
            'url' => $this->urls->getAbsoluteURL('/apps/plainshow/calendar'),
        ];
    }

    /** A new event; times are local (Swedish) times, or dates for a whole day. */
    public function addEvent(string $account, int $calendarId, string $title, string $start, string $end, bool $allDay, string $place = ''): array {
        $calendar = $this->calendar($account, $calendarId, 'events');
        $uid = $this->uid();
        $vcalendar = new VCalendar();
        $event = $vcalendar->add('VEVENT', ['UID' => $uid, 'SUMMARY' => mb_substr($title, 0, 200), 'DTSTAMP' => new DateTimeImmutable('now', new DateTimeZone('UTC'))]);
        $this->setTimes($event, $start, $end, $allDay);
        if ($place !== '') {
            $event->add('LOCATION', mb_substr($place, 0, 200));
        }
        $this->calDav->createCalendarObject($calendarId, "$uid.ics", $vcalendar->serialize());
        return $this->describeEvent($calendar, $event);
    }

    /** Changes the title, times or place of an event the assistant knows by its UID. */
    public function changeEvent(string $account, int $calendarId, string $uid, array $changes): array {
        $calendar = $this->calendar($account, $calendarId, 'events');
        [$object, $vcalendar] = $this->object($calendarId, $uid);
        $event = $vcalendar->VEVENT;
        if (isset($changes['title']) && $changes['title'] !== '') {
            $event->SUMMARY = mb_substr((string)$changes['title'], 0, 200);
        }
        if (!empty($changes['start'])) {
            $allDay = (bool)($changes['allDay'] ?? !$event->DTSTART->hasTime());
            $this->setTimes($event, (string)$changes['start'], (string)($changes['end'] ?? ''), $allDay);
        }
        if (isset($changes['place'])) {
            unset($event->LOCATION);
            if ($changes['place'] !== '') {
                $event->add('LOCATION', mb_substr((string)$changes['place'], 0, 200));
            }
        }
        $event->{'LAST-MODIFIED'} = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $event->SEQUENCE = (int)(string)($event->SEQUENCE ?? 0) + 1;
        $this->calDav->updateCalendarObject($calendarId, $object['uri'], $vcalendar->serialize());
        return $this->describeEvent($calendar, $event);
    }

    public function removeEvent(string $account, int $calendarId, string $uid): void {
        $this->calendar($account, $calendarId, 'events');
        [$object] = $this->object($calendarId, $uid);
        $this->calDav->deleteCalendarObject($calendarId, $object['uri']);
    }

    /** A new task, with a due date (and time) if given. */
    public function addTask(string $account, int $calendarId, string $title, ?string $due): array {
        $calendar = $this->calendar($account, $calendarId, 'tasks');
        $uid = $this->uid();
        $vcalendar = new VCalendar();
        $task = $vcalendar->add('VTODO', ['UID' => $uid, 'SUMMARY' => mb_substr($title, 0, 200), 'STATUS' => 'NEEDS-ACTION', 'DTSTAMP' => new DateTimeImmutable('now', new DateTimeZone('UTC'))]);
        if ($due !== null && $due !== '') {
            // A date alone is due that day; with a time, at that time.
            $when = new DateTimeImmutable($due, new DateTimeZone(self::ZONE));
            $task->add('DUE', $when, strlen($due) === 10 ? ['VALUE' => 'DATE'] : []);
        }
        $this->calDav->createCalendarObject($calendarId, "$uid.ics", $vcalendar->serialize());
        return ['uid' => $uid, 'title' => (string)$task->SUMMARY, 'due' => $due, 'calendar' => $calendar['name'], 'calendarId' => $calendarId, 'color' => $calendar['color'], 'url' => $this->urls->getAbsoluteURL('/apps/plainshow/calendar')];
    }

    /**
     * Files of a kind (audio, image, video, document or any), newest first,
     * whose name contains the words given.
     *
     * @return list<array{id: int, name: string, folder: ?string, type: string, size: int, changed: string, url: string}>
     */
    public function files(string $account, string $kind, string $words, int $limit): array {
        $home = $this->root->getUserFolder($account);
        $mimes = match ($kind) {
            'audio' => ['audio/'], 'image' => ['image/'], 'video' => ['video/'],
            'document' => ['application/pdf', 'application/vnd.', 'application/msword', 'text/'],
            default => [''],
        };
        $words = array_values(array_filter(preg_split('/\s+/', mb_strtolower(trim($words))) ?: []));
        $found = [];
        // The newest changes first; a name search reaches further back.
        foreach ($home->getRecent(400) as $node) {
            if ($node instanceof File && $this->matches($node, $mimes, $words)) {
                $found[$node->getId()] = $node;
            }
        }
        if (count($found) < $limit && $words) {
            foreach ($home->search($words[0]) as $node) {
                if ($node instanceof File && $this->matches($node, $mimes, $words)) {
                    $found[$node->getId()] = $node;
                }
            }
        }
        usort($found, fn (File $a, File $b) => $b->getMTime() <=> $a->getMTime());
        return array_map(fn (File $file) => $this->describeFile($home, $file), array_slice(array_values($found), 0, $limit));
    }

    /** Shares a file (read only) with another Cloud account. */
    public function share(string $account, int $fileId, string $with): array {
        if ($with === $account || !$this->users->userExists($with)) {
            throw new RuntimeException('That person has no Cloud account.');
        }
        $home = $this->root->getUserFolder($account);
        $node = $home->getFirstNodeById($fileId);
        if (!$node instanceof File) {
            throw new RuntimeException('That file is not in your Cloud.');
        }
        foreach ($this->shares->getSharesBy($account, IShare::TYPE_USER, $node, false, -1) as $existing) {
            if ($existing->getSharedWith() === $with) {
                return ['file' => $this->describeFile($home, $node), 'with' => $with, 'already' => true];
            }
        }
        $share = $this->shares->newShare();
        $share->setNode($node)->setShareType(IShare::TYPE_USER)->setSharedWith($with)->setSharedBy($account)->setPermissions(Constants::PERMISSION_READ);
        $this->shares->createShare($share);
        return ['file' => $this->describeFile($home, $node), 'with' => $with, 'already' => false];
    }

    /* ---------- Helpers ---------- */

    private function calendar(string $account, int $calendarId, string $kind): array {
        foreach ($this->calendars($account) as $calendar) {
            if ($calendar['id'] === $calendarId && $calendar[$kind]) {
                return $calendar;
            }
        }
        throw new RuntimeException('That calendar is not yours to write to.');
    }

    /** @return array{0: array, 1: VCalendar} */
    private function object(int $calendarId, string $uid): array {
        $object = $this->calDav->getCalendarObject($calendarId, preg_replace('/[^A-Za-z0-9._-]/', '', $uid) . '.ics');
        if (!is_array($object)) {
            throw new RuntimeException('That event is gone.');
        }
        return [$object, Reader::read($object['calendardata'])];
    }

    private function setTimes($component, string $start, string $end, bool $allDay): void {
        $zone = new DateTimeZone(self::ZONE);
        unset($component->DTSTART, $component->DTEND);
        if ($allDay) {
            $from = new DateTimeImmutable(substr($start, 0, 10), $zone);
            $to = $end !== '' ? new DateTimeImmutable(substr($end, 0, 10), $zone) : $from;
            $component->add('DTSTART', $from, ['VALUE' => 'DATE']);
            $component->add('DTEND', $to->modify('+1 day'), ['VALUE' => 'DATE']);
            return;
        }
        $from = new DateTimeImmutable($start, $zone);
        $to = $end !== '' ? new DateTimeImmutable($end, $zone) : $from->modify('+1 hour');
        if ($to <= $from) {
            $to = $from->modify('+1 hour');
        }
        $component->add('DTSTART', $from);
        $component->add('DTEND', $to);
    }

    private function describeEvent(array $calendar, $event): array {
        $zone = new DateTimeZone(self::ZONE);
        $allDay = !$event->DTSTART->hasTime();
        $from = DateTimeImmutable::createFromInterface($event->DTSTART->getDateTime($zone))->setTimezone($zone);
        $to = isset($event->DTEND) ? DateTimeImmutable::createFromInterface($event->DTEND->getDateTime($zone))->setTimezone($zone) : $from;
        return [
            'uid' => (string)$event->UID, 'title' => (string)$event->SUMMARY, 'place' => (string)($event->LOCATION ?? ''),
            'start' => $from->format(DATE_ATOM), 'end' => ($allDay ? $to->modify('-1 day') : $to)->format(DATE_ATOM), 'allDay' => $allDay,
            'calendar' => $calendar['name'], 'calendarId' => $calendar['id'], 'color' => $calendar['color'],
            'url' => $this->urls->getAbsoluteURL('/apps/plainshow/calendar'),
        ];
    }

    private function matches(File $file, array $mimes, array $words): bool {
        $mime = $file->getMimetype();
        $kind = false;
        foreach ($mimes as $prefix) {
            $kind = $kind || str_starts_with($mime, $prefix);
        }
        $name = mb_strtolower($file->getName());
        foreach ($words as $word) {
            if (!str_contains($name, $word)) {
                return false;
            }
        }
        return $kind;
    }

    private function describeFile(Folder $home, File $file): array {
        $folder = trim(dirname((string)$home->getRelativePath($file->getPath())), '/.');
        return [
            'id' => $file->getId(), 'name' => $file->getName(), 'folder' => $folder !== '' ? $folder : null,
            'type' => $file->getMimetype(), 'size' => $file->getSize(), 'changed' => date(DATE_ATOM, $file->getMTime()),
            'url' => $this->urls->getAbsoluteURL('/index.php/f/' . $file->getId()),
        ];
    }

    private function uid(): string {
        return 'plainshow-' . bin2hex(random_bytes(10));
    }
}
