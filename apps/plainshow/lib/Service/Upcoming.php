<?php

declare(strict_types=1);

namespace OCA\PlainShow\Service;

use DateTimeImmutable;
use DateTimeZone;
use OCA\DAV\CalDAV\CalDavBackend;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;

/** What is coming up in someone's calendars, repeats included. */
class Upcoming {
    public function __construct(
        private CalDavBackend $calDav,
    ) {
    }

    /** @return list<array{title: string, place: string, start: string, end: string, allDay: bool, calendar: string, color: ?string}> */
    public function events(string $account, int $days = 31, int $limit = 30): array {
        $zone = new DateTimeZone('Europe/Stockholm');
        $start = new DateTimeImmutable('today', $zone);
        $end = $start->modify("+$days days");
        $now = new DateTimeImmutable('now', $zone);
        $events = [];
        foreach ($this->calDav->getCalendarsForUser('principals/users/' . $account) as $calendar) {
            $components = $calendar['{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set'] ?? null;
            if ($components !== null && !in_array('VEVENT', $components->getValue(), true)) {
                continue; // a task list
            }
            $color = (string)($calendar['{http://apple.com/ns/ical/}calendar-color'] ?? '');
            $uris = $this->calDav->calendarQuery($calendar['id'], [
                'name' => 'VCALENDAR', 'is-not-defined' => false, 'time-range' => null, 'prop-filters' => [],
                'comp-filters' => [['name' => 'VEVENT', 'is-not-defined' => false, 'prop-filters' => [], 'comp-filters' => [], 'time-range' => ['start' => $start, 'end' => $end]]],
            ]);
            foreach (array_chunk($uris, 100) as $chunk) {
                foreach ($this->calDav->getMultipleCalendarObjects($calendar['id'], $chunk) as $object) {
                    try {
                        /** @var VCalendar $vcalendar */
                        $vcalendar = Reader::read($object['calendardata'])->expand($start, $end, $zone);
                    } catch (Throwable) {
                        continue;
                    }
                    foreach ($vcalendar->VEVENT ?? [] as $event) {
                        $allDay = !$event->DTSTART->hasTime();
                        $from = DateTimeImmutable::createFromInterface($event->DTSTART->getDateTime($zone));
                        $to = isset($event->DTEND) ? DateTimeImmutable::createFromInterface($event->DTEND->getDateTime($zone)) : $from;
                        if ($to < $now && !($allDay && $to >= $start)) {
                            continue;
                        }
                        $events[] = [
                            'title' => mb_substr((string)($event->SUMMARY ?? '') ?: 'Busy', 0, 120),
                            'place' => mb_substr((string)($event->LOCATION ?? ''), 0, 120),
                            'start' => $from->format(DATE_ATOM),
                            'end' => $to->format(DATE_ATOM),
                            'allDay' => $allDay,
                            'calendar' => (string)($calendar['{DAV:}displayname'] ?? ''),
                            'color' => preg_match('/^#[0-9a-f]{6}/i', $color) ? substr($color, 0, 7) : null,
                        ];
                    }
                }
            }
        }
        usort($events, fn ($a, $b) => strcmp($a['start'], $b['start']));
        return array_slice($events, 0, $limit);
    }
}
