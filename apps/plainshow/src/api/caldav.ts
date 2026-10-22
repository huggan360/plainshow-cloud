import ICAL from 'ical.js';
import { boot } from '../boot';
import { api, CloudError, request } from './http';

/** One calendar or task list, as CalDAV describes it. */
export type Calendar = {
    href: string;           // "/remote.php/dav/calendars/hugo/personal/"
    name: string;
    color: string;
    events: boolean;        // holds events
    tasks: boolean;         // holds tasks
    writable: boolean;
    enabled: boolean;       // shown (stored on the server, like the old Calendar app did)
    owner: string | null;   // someone else's, shared with you
    birthdays: boolean;
    subscription: boolean;
};

/** One occurrence of an event (repeats come one by one, from the server). */
export type Occurrence = {
    key: string;
    href: string;
    etag: string;
    calendar: Calendar;
    uid: string;
    recurrenceId: number | null;  // which repeat this is (ms), null when the event does not repeat
    title: string;
    location: string;
    notes: string;
    start: Date;
    end: Date;
    allDay: boolean;
};

export type Task = {
    href: string; etag: string; calendar: Calendar; uid: string;
    title: string; notes: string; due: Date | null; done: boolean; completed: Date | null;
};

const NS = { d: 'DAV:', c: 'urn:ietf:params:xml:ns:caldav', a: 'http://apple.com/ns/ical/', nc: 'http://nextcloud.org/ns', oc: 'http://owncloud.org/ns' };
const text = (node: Element, ns: string, name: string) => node.getElementsByTagNameNS(ns, name)[0]?.textContent ?? '';
// Kept as the server sends them (encoded), so they can be requested again as they are.
const hrefOf = (node: Element) => text(node, NS.d, 'href').replace(boot.webroot, '');

async function dav(url: string, method: string, body?: string, headers: Record<string, string> = {}): Promise<Response> {
    const response = await request(url, { method, body, headers: { 'Content-Type': 'application/xml; charset=utf-8', ...headers } });
    if (!response.ok && response.status !== 207) {
        const xml = await response.text();
        throw new CloudError(xml.match(/<s:message>([^<]*)<\/s:message>/)?.[1] || (response.status === 412 ? 'Someone changed this meanwhile. Reload and try again.' : `Calendar answered ${response.status}.`), response.status);
    }
    return response;
}

async function multistatus(response: Response): Promise<Element[]> {
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(NS.d, 'response'));
}

const home = () => `/remote.php/dav/calendars/${encodeURIComponent(boot.user.id)}/`;

function escapeXml(value: string): string {
    return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

/* ---------- Time zones ---------- */

// Everyone is in Sweden. New events are written in Stockholm time, so a weekly
// meeting stays at 10:00 across summer time.
const STOCKHOLM = `BEGIN:VTIMEZONE
TZID:Europe/Stockholm
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

/** Parse a calendar file and make its time zones known, so times read right. */
function parse(ics: string): ICAL.Component {
    const vcal = new ICAL.Component(ICAL.parse(ics));
    vcal.getAllSubcomponents('vtimezone').forEach((zone) => {
        const tzid = String(zone.getFirstPropertyValue('tzid'));
        if (!ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(new ICAL.Timezone(zone));
    });
    return vcal;
}

/** The zone a file's times are written in: its own, or Stockholm (added). */
function zoneOf(vcal: ICAL.Component): ICAL.Timezone {
    const own = vcal.getFirstSubcomponent('vtimezone');
    if (own) return new ICAL.Timezone(own);
    const component = new ICAL.Component(ICAL.parse(STOCKHOLM));
    vcal.addSubcomponent(component);
    const zone = new ICAL.Timezone(component);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
    return zone;
}

const now = () => ICAL.Time.fromJSDate(new Date(), true);
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function fromIcal(time: ICAL.Time): Date {
    return time.isDate ? new Date(time.year, time.month - 1, time.day) : time.toJSDate();
}

function toIcal(date: Date, allDay: boolean, zone?: ICAL.Timezone | null): ICAL.Time {
    if (allDay) return ICAL.Time.fromDateString(dayKey(date));
    if (zone?.tzid === 'floating') return ICAL.Time.fromJSDate(date, false);
    const value = ICAL.Time.fromJSDate(date, true);
    return zone && zone.tzid !== 'UTC' ? value.convertToZone(zone) : value;
}

/* ---------- Calendars ---------- */

export async function calendars(): Promise<Calendar[]> {
    const nodes = await multistatus(await dav(home(), 'PROPFIND', `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
<d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><a:calendar-order/><c:supported-calendar-component-set/><d:current-user-privilege-set/><nc:owner-displayname/><oc:owner-principal/><oc:calendar-enabled/></d:prop>
</d:propfind>`, { Depth: '1' }));
    const list = nodes.flatMap((node) => {
        const href = hrefOf(node);
        const subscription = node.getElementsByTagNameNS('http://calendarserver.org/ns/', 'subscribed').length > 0;
        if ((!node.getElementsByTagNameNS(NS.c, 'calendar').length && !subscription) || /\/(inbox|outbox|trashbin)\/$/.test(href)) return [];
        const components = Array.from(node.getElementsByTagNameNS(NS.c, 'comp')).map((comp) => comp.getAttribute('name'));
        const privileges = Array.from(node.getElementsByTagNameNS(NS.d, 'privilege')).map((p) => p.firstElementChild?.localName);
        const ownerPrincipal = text(node, NS.oc, 'owner-principal').replace(/\/$/, '');
        const mine = !ownerPrincipal || ownerPrincipal.endsWith('/' + boot.user.id);
        const birthdays = href.endsWith('/contact_birthdays/');
        return [{
            href,
            name: birthdays ? 'Birthdays' : text(node, NS.d, 'displayname') || decodeURIComponent(href.split('/').filter(Boolean).pop() || '') || 'Calendar',
            color: (text(node, NS.a, 'calendar-color') || '#FC5000').slice(0, 7),
            events: components.length === 0 || components.includes('VEVENT'),
            tasks: components.includes('VTODO'),
            writable: !birthdays && !subscription && (privileges.includes('write') || privileges.includes('all') || privileges.includes('write-content')),
            enabled: text(node, NS.oc, 'calendar-enabled') !== '0',
            owner: mine ? null : text(node, NS.nc, 'owner-displayname') || ownerPrincipal.split('/').pop() || null,
            birthdays,
            subscription,
            order: Number(text(node, NS.a, 'calendar-order')) || 0,
        }];
    });
    const unique = new Map<string, (typeof list)[number]>();
    list.forEach((calendar) => {
        const known = unique.get(calendar.href);
        unique.set(calendar.href, known ? {
            ...known, ...calendar,
            events: known.events || calendar.events,
            tasks: known.tasks || calendar.tasks,
            subscription: known.subscription || calendar.subscription,
            writable: known.writable && calendar.writable,
        } : calendar);
    });
    return [...unique.values()].sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || Number(a.birthdays) - Number(b.birthdays) || a.order - b.order || a.name.localeCompare(b.name))
        .map(({ order: _order, ...calendar }) => calendar);
}

export async function createCalendar(name: string, color: string, kind: 'events' | 'tasks' = 'events'): Promise<void> {
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'calendar';
    await dav(`${home()}${slug}-${Math.random().toString(36).slice(2, 7)}/`, 'MKCOL', `<?xml version="1.0"?>
<d:mkcol xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
<d:set><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>${escapeXml(name)}</d:displayname><a:calendar-color>${color}</a:calendar-color>
<c:supported-calendar-component-set><c:comp name="${kind === 'tasks' ? 'VTODO' : 'VEVENT'}"/></c:supported-calendar-component-set></d:prop></d:set></d:mkcol>`);
}

export async function subscribeCalendar(name: string, source: string, color: string): Promise<void> {
    const url = new URL(source);
    if (!['http:', 'https:', 'webcal:'].includes(url.protocol)) throw new Error('Use a calendar subscription link.');
    if (url.protocol === 'webcal:') url.protocol = 'https:';
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subscription';
    await dav(`${home()}${slug}-${Math.random().toString(36).slice(2, 7)}/`, 'MKCOL', `<?xml version="1.0"?>
<d:mkcol xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
<d:set><d:prop><d:resourcetype><d:collection/><cs:subscribed/></d:resourcetype><d:displayname>${escapeXml(name)}</d:displayname><cs:source><d:href>${escapeXml(url.toString())}</d:href></cs:source><a:calendar-color>${color}</a:calendar-color><a:refreshrate>PT1H</a:refreshrate></d:prop></d:set></d:mkcol>`);
}

export async function updateCalendar(calendar: Calendar, changes: { name?: string; color?: string; enabled?: boolean }): Promise<void> {
    const props = [
        changes.name !== undefined && calendar.owner === null ? `<d:displayname>${escapeXml(changes.name)}</d:displayname>` : '',
        changes.color !== undefined ? `<a:calendar-color>${changes.color}</a:calendar-color>` : '',
        changes.enabled !== undefined ? `<oc:calendar-enabled>${changes.enabled ? 1 : 0}</oc:calendar-enabled>` : '',
    ].join('');
    if (!props) return;
    await dav(calendar.href, 'PROPPATCH', `<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/" xmlns:oc="http://owncloud.org/ns"><d:set><d:prop>${props}</d:prop></d:set></d:propertyupdate>`);
}

/** Your own calendar goes to the trash; a shared one is only taken off your list. */
export async function deleteCalendar(calendar: Calendar): Promise<void> {
    await dav(calendar.href, 'DELETE');
}

export type CalendarShare = { id: string; name: string; write: boolean; group: boolean };

export async function calendarShares(calendar: Calendar): Promise<CalendarShare[]> {
    const nodes = await multistatus(await dav(calendar.href, 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:invite/></d:prop></d:propfind>', { Depth: '0' }));
    const people = [...Array.from(nodes[0]?.getElementsByTagNameNS(NS.oc, 'user') ?? []), ...Array.from(nodes[0]?.getElementsByTagNameNS(NS.oc, 'group') ?? [])];
    return people.flatMap((user) => {
        const principal = text(user, NS.d, 'href');
        const match = principal.match(/principals\/(users|groups)\/([^/]+)/);
        const id = decodeURIComponent(match?.[2] ?? '');
        if (!id) return [];
        return [{ id, name: text(user, NS.oc, 'common-name') || id, write: user.getElementsByTagNameNS(NS.oc, 'read-write').length > 0, group: match?.[1] === 'groups' }];
    });
}

export async function shareCalendar(calendar: Calendar, person: string, access: 'read' | 'write' | null, group = false): Promise<void> {
    const principal = `<d:href>principal:principals/${group ? 'groups' : 'users'}/${escapeXml(person)}</d:href>`;
    const body = access === null
        ? `<oc:remove>${principal}</oc:remove>`
        : `<oc:set>${principal}${access === 'write' ? '<oc:read-write/>' : ''}</oc:set>`;
    await dav(calendar.href, 'POST', `<?xml version="1.0"?><oc:share xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${body}</oc:share>`);
}

/* ---------- Events ---------- */

/** Events between two moments, repeats included (the server expands them). */
async function queryOccurrences(calendar: Calendar, from: Date, to: Date): Promise<Occurrence[]> {
    const nodes = await multistatus(await dav(calendar.href, 'REPORT', `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:prop><d:getetag/><c:calendar-data><c:expand start="${utc(from)}" end="${utc(to)}"/></c:calendar-data></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utc(from)}" end="${utc(to)}"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`, { Depth: '1' }));
    const out: Occurrence[] = [];
    nodes.forEach((node) => {
        const href = hrefOf(node);
        const data = text(node, NS.c, 'calendar-data');
        if (!data) return;
        try {
            parse(data).getAllSubcomponents('vevent').forEach((vevent) => {
                const event = new ICAL.Event(vevent);
                if (!event.startDate) return;
                const start = fromIcal(event.startDate);
                let end = event.endDate ? fromIcal(event.endDate) : start;
                if (end <= start && event.startDate.isDate) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
                const recurrence = vevent.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
                out.push({
                    key: `${href}#${recurrence ? fromIcal(recurrence).getTime() : ''}`,
                    href, etag: text(node, NS.d, 'getetag'), calendar, uid: event.uid,
                    recurrenceId: recurrence ? fromIcal(recurrence).getTime() : null,
                    title: event.summary || 'Busy', location: event.location || '', notes: event.description || '',
                    start, end, allDay: event.startDate.isDate,
                });
            });
        } catch { /* one broken event must not hide the rest */ }
    });
    return out;
}

type SubscriptionObject = { href: string; etag: string; data: string };

function occurrence(event: ICAL.Event, startTime: ICAL.Time, href: string, etag: string, calendar: Calendar, recurrenceId: number | null): Occurrence {
    const start = fromIcal(startTime);
    const duration = event.duration?.toSeconds() ?? 0;
    let end = new Date(start.getTime() + duration * 1000);
    if (end <= start && startTime.isDate) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return {
        key: `${href}#${recurrenceId ?? ''}`,
        href, etag, calendar, uid: event.uid,
        recurrenceId,
        title: event.summary || 'Busy', location: event.location || '', notes: event.description || '',
        start, end, allDay: startTime.isDate,
    };
}

function subscriptionOccurrences(object: SubscriptionObject, calendar: Calendar, from: Date, to: Date): Occurrence[] {
    const out: Occurrence[] = [];
    try {
        const vcal = parse(object.data);
        const components = vcal.getAllSubcomponents('vevent');
        const masters = components.filter((component) => !component.getFirstPropertyValue('recurrence-id'));
        const exceptions = components.filter((component) => component.getFirstPropertyValue('recurrence-id'));
        for (const component of masters) {
            const event = new ICAL.Event(component);
            if (!event.startDate) continue;
            exceptions.forEach((exception) => {
                try { event.relateException(new ICAL.Event(exception)); } catch { /* ignore a malformed exception */ }
            });
            if (!event.isRecurring()) {
                const item = occurrence(event, event.startDate, calendar.href + object.href, object.etag, calendar, null);
                if (item.start < to && item.end > from) out.push(item);
                continue;
            }
            const iterator = event.iterator(ICAL.Time.fromJSDate(from, true));
            for (let next = iterator.next(); next; next = iterator.next()) {
                const start = fromIcal(next);
                if (start >= to) break;
                const details = event.getOccurrenceDetails(next);
                const item = occurrence(details.item, details.startDate, calendar.href + object.href, object.etag, calendar, start.getTime());
                if (item.end > from) out.push(item);
            }
        }
    } catch { /* one broken subscription object must not hide the rest */ }
    return out;
}

async function cachedSubscriptionOccurrences(calendar: Calendar, from: Date, to: Date): Promise<Occurrence[]> {
    const uri = decodeURIComponent(calendar.href.split('/').filter(Boolean).pop() || '');
    const response = await api<{ objects: SubscriptionObject[] }>(`/api/calendar/subscriptions/${encodeURIComponent(uri)}/objects`);
    return response.objects.flatMap((object) => subscriptionOccurrences(object, calendar, from, to));
}

export async function occurrences(calendar: Calendar, from: Date, to: Date): Promise<Occurrence[]> {
    return calendar.subscription ? cachedSubscriptionOccurrences(calendar, from, to) : queryOccurrences(calendar, from, to);
}

/** The stored event, repeats unexpanded, for editing. */
export async function load(href: string): Promise<{ ics: string; etag: string }> {
    const response = await dav(href, 'GET', undefined, { Accept: 'text/calendar' });
    return { ics: await response.text(), etag: response.headers.get('ETag') || '' };
}

async function save(href: string, ics: string, etag?: string): Promise<void> {
    await dav(href, 'PUT', ics, { 'Content-Type': 'text/calendar; charset=utf-8', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) });
}

export async function remove(href: string, etag?: string): Promise<void> {
    await dav(href, 'DELETE', undefined, etag ? { 'If-Match': etag } : {});
}

/** Move an event to another calendar. */
export async function moveEvent(href: string, to: Calendar): Promise<void> {
    await dav(href, 'MOVE', undefined, { Destination: window.location.origin + boot.webroot + to.href + href.split('/').pop(), Overwrite: 'F' });
}

/** "custom" is a rule this form cannot show (every other week, some weekdays): kept as it is. */
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type Draft = {
    title: string; location: string; notes: string; allDay: boolean; start: Date; end: Date;
    repeat: Repeat; until: Date | null;
    reminder: number | null; // minutes before the start (negative is after: 9:00 on an all-day event), null for none
};

const master = (vcal: ICAL.Component) => vcal.getAllSubcomponents('vevent').find((v) => !v.getFirstPropertyValue('recurrence-id')) ?? vcal.getFirstSubcomponent('vevent')!;

function apply(vevent: ICAL.Component, draft: Draft, zone: ICAL.Timezone | null, previous?: Draft) {
    const set = (name: string, value: string | ICAL.Time | null) => {
        vevent.removeAllProperties(name);
        if (value === null || value === '') return;
        const property = vevent.addPropertyWithValue(name, value);
        if (value instanceof ICAL.Time && !value.isDate && zone && !['UTC', 'floating'].includes(zone.tzid) && (name === 'dtstart' || name === 'dtend')) property.setParameter('tzid', zone.tzid);
    };
    set('summary', draft.title.trim() || 'New event');
    set('location', draft.location.trim());
    set('description', draft.notes.trim());
    set('dtstart', toIcal(draft.start, draft.allDay, zone));
    const end = draft.allDay ? new Date(draft.end.getFullYear(), draft.end.getMonth(), draft.end.getDate() + 1) : draft.end;
    set('dtend', toIcal(end, draft.allDay, zone));
    vevent.removeAllProperties('duration');
    if (draft.repeat !== 'custom') {
        vevent.removeAllProperties('rrule');
        if (draft.repeat !== 'none') {
            const rule: Record<string, unknown> = { freq: draft.repeat.toUpperCase() };
            if (draft.until) {
                rule.until = draft.allDay
                    ? ICAL.Time.fromDateString(dayKey(draft.until))
                    : ICAL.Time.fromJSDate(new Date(draft.until.getFullYear(), draft.until.getMonth(), draft.until.getDate(), 23, 59, 59), true);
            }
            vevent.addPropertyWithValue('rrule', new ICAL.Recur(rule as never));
        }
    }
    const reminderChanged = !previous || previous.reminder !== draft.reminder;
    if (reminderChanged) vevent.getAllSubcomponents('valarm').forEach((alarm) => vevent.removeSubcomponent(alarm));
    if (reminderChanged && draft.reminder !== null) {
        const alarm = new ICAL.Component('valarm');
        alarm.addPropertyWithValue('action', 'DISPLAY');
        alarm.addPropertyWithValue('description', draft.title.trim() || 'Reminder');
        const trigger = alarm.addPropertyWithValue('trigger', ICAL.Duration.fromSeconds(-draft.reminder * 60));
        trigger.setParameter('related', 'START');
        vevent.addSubcomponent(alarm);
    }
    const sequence = Number(vevent.getFirstPropertyValue('sequence') || 0) + 1;
    set('dtstamp', now());
    set('last-modified', now());
    set('sequence', String(sequence));
}

function calendarFile(): ICAL.Component {
    const vcal = new ICAL.Component('vcalendar');
    vcal.addPropertyWithValue('prodid', '-//PlainShow//Cloud//EN');
    vcal.addPropertyWithValue('version', '2.0');
    return vcal;
}

export async function createEvent(calendar: Calendar, draft: Draft): Promise<void> {
    const vcal = calendarFile();
    const zone = draft.allDay ? null : zoneOf(vcal);
    const vevent = new ICAL.Component('vevent');
    const uid = crypto.randomUUID();
    vevent.addPropertyWithValue('uid', uid);
    vevent.addPropertyWithValue('created', now());
    apply(vevent, draft, zone);
    vcal.addSubcomponent(vevent);
    await save(`${calendar.href}${uid}.ics`, vcal.toString());
}

/** What an existing event says, for the form. */
export function draftOf(ics: string): Draft {
    const vevent = master(parse(ics));
    const event = new ICAL.Event(vevent);
    const allDay = event.startDate.isDate;
    const start = fromIcal(event.startDate);
    let end = event.endDate ? fromIcal(event.endDate) : start;
    if (allDay) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    const rule = vevent.getFirstPropertyValue('rrule') as ICAL.Recur | null;
    const simple = rule && (rule.interval ?? 1) === 1 && !rule.count && Object.keys(rule.parts ?? {}).length === 0 && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(rule.freq));
    const alarm = vevent.getFirstSubcomponent('valarm');
    const trigger = alarm?.getFirstPropertyValue('trigger');
    return {
        title: event.summary || '', location: event.location || '', notes: event.description || '', allDay, start, end: end < start ? start : end,
        repeat: !rule ? 'none' : simple ? (String(rule.freq).toLowerCase() as Repeat) : 'custom',
        until: rule?.until ? fromIcal(rule.until) : null,
        reminder: trigger instanceof ICAL.Duration ? Math.round(-trigger.toSeconds() / 60) : null,
    };
}

/** Change the event, or the whole series when it repeats. Keeps its time zone. */
export async function updateEvent(href: string, etag: string, ics: string, draft: Draft): Promise<void> {
    const vcal = parse(ics);
    const vevent = master(vcal);
    const before = new ICAL.Event(vevent);
    const moved = fromIcal(before.startDate).getTime() !== draft.start.getTime() || before.startDate.isDate !== draft.allDay;
    const zone = before.startDate.isDate ? zoneOf(vcal) : before.startDate.zone;
    apply(vevent, draft, draft.allDay ? null : zone, draftOf(ics));
    // Repeats moved one by one belong to the old dates; when the series moves or stops repeating, they go.
    if (draft.repeat === 'none' || moved) {
        vcal.getAllSubcomponents('vevent').filter((v) => v !== vevent).forEach((v) => vcal.removeSubcomponent(v));
        if (moved) vevent.removeAllProperties('exdate');
    }
    await save(href, vcal.toString(), etag);
}

/** Remove one repeat of an event, leaving the rest. */
export async function skipOccurrence(occurrence: Occurrence): Promise<void> {
    if (occurrence.recurrenceId === null) return remove(occurrence.href, occurrence.etag);
    const { ics, etag } = await load(occurrence.href);
    const vcal = parse(ics);
    const series = master(vcal);
    const first = series.getFirstPropertyValue('dtstart') as ICAL.Time;
    const when = new Date(occurrence.recurrenceId);
    const zone = first.zone?.tzid ?? 'floating';
    let value: ICAL.Time;
    if (first.isDate) value = ICAL.Time.fromDateString(dayKey(when));
    else if (zone === 'floating') value = ICAL.Time.fromJSDate(when, false);
    else value = zone === 'UTC' ? ICAL.Time.fromJSDate(when, true) : ICAL.Time.fromJSDate(when, true).convertToZone(first.zone!);
    const property = series.addPropertyWithValue('exdate', value);
    if (!first.isDate && !['UTC', 'floating'].includes(zone)) property.setParameter('tzid', zone);
    vcal.getAllSubcomponents('vevent')
        .filter((v) => v !== series && fromIcal(v.getFirstPropertyValue('recurrence-id') as ICAL.Time).getTime() === occurrence.recurrenceId)
        .forEach((v) => vcal.removeSubcomponent(v));
    await save(occurrence.href, vcal.toString(), etag);
}

/* ---------- Tasks ---------- */

export async function tasks(calendar: Calendar): Promise<Task[]> {
    const nodes = await multistatus(await dav(calendar.href, 'REPORT', `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:prop><d:getetag/><c:calendar-data/></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>
</c:calendar-query>`, { Depth: '1' }));
    const out: Task[] = [];
    nodes.forEach((node) => {
        const data = text(node, NS.c, 'calendar-data');
        if (!data) return;
        try {
            const vtodo = parse(data).getFirstSubcomponent('vtodo');
            if (!vtodo) return;
            const due = vtodo.getFirstPropertyValue('due') as ICAL.Time | null;
            const completed = vtodo.getFirstPropertyValue('completed') as ICAL.Time | null;
            out.push({
                href: hrefOf(node), etag: text(node, NS.d, 'getetag'), calendar,
                uid: String(vtodo.getFirstPropertyValue('uid')),
                title: String(vtodo.getFirstPropertyValue('summary') || ''), notes: String(vtodo.getFirstPropertyValue('description') || ''),
                due: due ? fromIcal(due) : null,
                done: String(vtodo.getFirstPropertyValue('status') || '').toUpperCase() === 'COMPLETED' || !!completed,
                completed: completed ? completed.toJSDate() : null,
            });
        } catch { /* skip */ }
    });
    return out;
}

export async function saveTask(calendar: Calendar, changes: { title?: string; notes?: string; due?: Date | null; done?: boolean }, existing?: Task): Promise<void> {
    let vcal: ICAL.Component;
    let vtodo: ICAL.Component;
    let etag: string | undefined;
    if (existing) {
        const stored = await load(existing.href);
        etag = stored.etag;
        vcal = parse(stored.ics);
        vtodo = vcal.getFirstSubcomponent('vtodo')!;
    } else {
        vcal = calendarFile();
        vtodo = new ICAL.Component('vtodo');
        vtodo.addPropertyWithValue('uid', crypto.randomUUID());
        vtodo.addPropertyWithValue('created', now());
        vtodo.addPropertyWithValue('status', 'NEEDS-ACTION');
        vcal.addSubcomponent(vtodo);
    }
    const set = (name: string, value: string | ICAL.Time | number | null) => { vtodo.removeAllProperties(name); if (value !== null && value !== '') vtodo.addPropertyWithValue(name, value as never); };
    if (changes.title !== undefined) set('summary', changes.title.trim());
    if (changes.notes !== undefined) set('description', changes.notes.trim());
    if (changes.due !== undefined) set('due', changes.due ? ICAL.Time.fromDateString(dayKey(changes.due)) : null);
    if (changes.done !== undefined) {
        set('status', changes.done ? 'COMPLETED' : 'NEEDS-ACTION');
        set('percent-complete', changes.done ? 100 : null);
        set('completed', changes.done ? now() : null);
    }
    set('dtstamp', now());
    set('last-modified', now());
    await save(existing?.href ?? `${calendar.href}${String(vtodo.getFirstPropertyValue('uid'))}.ics`, vcal.toString(), etag);
}

export async function removeTask(task: Task): Promise<void> {
    await remove(task.href, task.etag);
}
