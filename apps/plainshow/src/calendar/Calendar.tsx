import { CSSProperties, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as caldav from '../api/caldav';
import { Calendar as Cal, CalendarShare, dayKey, Draft, Occurrence, Repeat, Task } from '../api/caldav';
import { Sharee } from '../api/shares';
import { PeoplePicker, plainShowSharee } from '../PeoplePicker';
import { Link, navigate, usePath, useQuery } from '../router';
import { PageHead, setSidebarExtra } from '../Shell';
import { failed, toast } from '../toast';
import { Button, Empty, Field, Modal, Switch } from '../ui';
import Tasks from './Tasks';
import { t, locale } from '../i18n';

type View = 'month' | 'week' | 'day' | 'agenda';
const VIEW_NAMES: Record<View, string> = { month: t('Month'), week: t('Week'), day: t('Day'), agenda: t('Agenda') };

/* ---------- The calendars, shared by every part of the page ---------- */

let store: Cal[] | null = null;
const storeListeners = new Set<() => void>();
let loading: Promise<void> | null = null;

export function reloadCalendars(): Promise<void> {
    loading = caldav.calendars()
        .then((list) => { store = list; })
        .catch((error) => { failed(error); store = store ?? []; })
        .finally(() => { loading = null; storeListeners.forEach((listener) => listener()); });
    return loading;
}

export function useCalendars(): Cal[] | null {
    const [, force] = useState(0);
    useEffect(() => {
        const listener = () => force((n) => n + 1);
        storeListeners.add(listener);
        if (store === null && !loading) void reloadCalendars();
        return () => { storeListeners.delete(listener); };
    }, []);
    return store;
}

/** Change a calendar right away on screen, then on the server. */
async function changeCalendar(calendar: Cal, changes: { name?: string; color?: string; enabled?: boolean }) {
    store = (store ?? []).map((c) => (c.href === calendar.href ? { ...c, ...changes } : c));
    storeListeners.forEach((listener) => listener());
    try { await caldav.updateCalendar(calendar, changes); } catch (error) { failed(error); void reloadCalendars(); }
}

/* ---------- Dates ---------- */

const DAY = 86400000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const parseDay = (value: string | null) => {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : startOfDay(new Date());
};
const clock = (date: Date) => date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const timeInput = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const withTime = (day: Date, time: string) => { const [h, m] = time.split(':').map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0); };
// Monday first, in the chosen language (5 January 2026 is a Monday).
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 5 + i).toLocaleDateString(locale, { weekday: 'short' }));

function rangeOf(view: View, date: Date): { from: Date; to: Date; days: Date[] } {
    if (view === 'month') {
        const from = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
        const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
        return { from, to: addDays(from, 42), days };
    }
    if (view === 'week') {
        const from = startOfWeek(date);
        return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
    }
    if (view === 'day') return { from: startOfDay(date), to: addDays(startOfDay(date), 1), days: [startOfDay(date)] };
    const from = startOfDay(date);
    return { from, to: addDays(from, 30), days: Array.from({ length: 30 }, (_, i) => addDays(from, i)) };
}

function titleOf(view: View, date: Date): string {
    if (view === 'month') return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    if (view === 'day') return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const { from, to } = rangeOf(view, date);
    const last = addDays(to, -1);
    const sameMonth = from.getMonth() === last.getMonth();
    return t('{from} to {to}', { from: from.toLocaleDateString(locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' }), to: last.toLocaleDateString(locale, { day: 'numeric', month: sameMonth ? 'long' : 'short', year: 'numeric' }) });
}

/** Does an occurrence touch this day? */
function touches(item: { start: Date; end: Date }, day: Date): boolean {
    const from = startOfDay(day).getTime();
    const to = from + DAY;
    const start = item.start.getTime();
    const end = Math.max(item.end.getTime(), start + 1);
    return start < to && end > from;
}

const chipStyle = (color: string) => ({ '--cal': color } as CSSProperties);

/* ---------- The page ---------- */

export default function Calendar({ path }: { path: string }) {
    useEffect(() => { setSidebarExtra(<CalendarList />); return () => setSidebarExtra(null); }, []);
    if (path === '/calendar/tasks') return <Tasks />;
    const view = (path.match(/^\/calendar\/(week|day|agenda)/)?.[1] ?? 'month') as View;
    return <Planner view={view} />;
}

type Editing = { occurrence?: Occurrence; initial?: Partial<Draft> };

function Planner({ view }: { view: View }) {
    const query = useQuery();
    const date = parseDay(query.get('date'));
    const calendars = useCalendars();
    const [items, setItems] = useState<Occurrence[] | null>(null);
    const [due, setDue] = useState<Task[]>([]);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [version, setVersion] = useState(0);
    const range = useMemo(() => rangeOf(view, date), [view, dayKey(date)]);
    const shown = useMemo(() => (calendars ?? []).filter((c) => c.enabled), [calendars]);
    const shownKey = shown.map((c) => c.href + c.color).join('|');

    useEffect(() => {
        if (calendars === null) return;
        let current = true;
        const eventCalendars = shown.filter((c) => c.events);
        Promise.all(eventCalendars.map((c) => caldav.occurrences(c, range.from, range.to).catch(() => [] as Occurrence[])))
            .then((lists) => { if (current) setItems(lists.flat().sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title))); });
        Promise.all(shown.filter((c) => c.tasks).map((c) => caldav.tasks(c).catch(() => [] as Task[])))
            .then((lists) => { if (current) setDue(lists.flat().filter((t) => t.due && !t.done && t.due >= range.from && t.due < range.to)); });
        return () => { current = false; };
    }, [range, shownKey, version, calendars === null]);

    const go = (to: View, day: Date) => navigate(`/calendar${to === 'month' ? '' : '/' + to}?date=${dayKey(day)}`);
    const step = (direction: number) => {
        if (view === 'month') go(view, new Date(date.getFullYear(), date.getMonth() + direction, 1));
        else go(view, addDays(date, direction * (view === 'week' ? 7 : view === 'day' ? 1 : 30)));
    };
    const create = (initial: Partial<Draft>) => setEditing({ initial });
    const saved = () => { setEditing(null); setVersion((v) => v + 1); };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (editing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === 't') go(view, new Date());
            if (event.key === 'ArrowLeft') step(-1);
            if (event.key === 'ArrowRight') step(1);
            if (event.key === 'n') create({ start: withTime(date, '09:00'), end: withTime(date, '10:00') });
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });

    const writable = (calendars ?? []).filter((c) => c.writable && c.events);
    return (
        <div className="cloud-cal">
            <PageHead title={t('Calendar')} actions={writable.length > 0 && <Button variant="primary" icon="bx-plus" onClick={() => create({ start: withTime(sameDay(date, new Date()) ? new Date() : date, sameDay(date, new Date()) ? timeInput(new Date(Math.ceil(Date.now() / 1800000) * 1800000)) : '09:00') })}>{t('New event')}</Button>} />
            <div className="cloud-toolbar cloud-cal__toolbar">
                <Button size="sm" onClick={() => go(view, new Date())}>{t('Today')}</Button>
                <div className="cloud-cal__steps">
                    <Button size="sm" variant="ghost" iconOnly icon="bx-chevron-left" aria-label={t('Back')} onClick={() => step(-1)} />
                    <Button size="sm" variant="ghost" iconOnly icon="bx-chevron-right" aria-label={t('Forward')} onClick={() => step(1)} />
                </div>
                <h2 className="cloud-cal__title">{titleOf(view, date)}</h2>
                <span className="cloud-toolbar__spacer" />
                <div className="cloud-segment cloud-segment--text" role="tablist" aria-label={t('View')}>
                    {(['month', 'week', 'day', 'agenda'] as View[]).map((v) => (
                        <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'is-active' : ''} onClick={() => go(v, date)}>{VIEW_NAMES[v]}</button>
                    ))}
                </div>
            </div>
            {calendars === null || items === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : (
                <>
                    {view === 'month' && <Month date={date} days={range.days} items={items} due={due} onOpen={(occurrence) => setEditing({ occurrence })} onDay={(day) => go('day', day)} onCreate={create} />}
                    {(view === 'week' || view === 'day') && <TimeGrid days={range.days} items={items} due={due} onOpen={(occurrence) => setEditing({ occurrence })} onDay={(day) => go('day', day)} onCreate={create} />}
                    {view === 'agenda' && <Agenda days={range.days} items={items} due={due} onOpen={(occurrence) => setEditing({ occurrence })} onMore={() => step(1)} />}
                    {calendars.length === 0 && <Empty icon="bx-calendar">{t('You have no calendars yet. Make one in the list beside.')}</Empty>}
                </>
            )}
            {editing && <EventEditor {...editing} calendars={calendars ?? []} onClose={() => setEditing(null)} onSaved={saved} />}
        </div>
    );
}

/* ---------- Month ---------- */

function Month({ date, days, items, due, onOpen, onDay, onCreate }: {
    date: Date; days: Date[]; items: Occurrence[]; due: Task[];
    onOpen: (o: Occurrence) => void; onDay: (day: Date) => void; onCreate: (initial: Partial<Draft>) => void;
}) {
    const today = new Date();
    const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
    return (
        <div className="cloud-month" role="grid" aria-label={t('Month')}>
            <div className="cloud-month__head" role="row">{WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}</div>
            {weeks.map((week) => (
                <div key={dayKey(week[0])} className="cloud-month__week" role="row">
                    {week.map((day) => {
                        const list = items.filter((item) => touches(item, day));
                        const tasks = due.filter((task) => task.due && sameDay(task.due, day));
                        const visible = list.slice(0, 3);
                        const more = list.length - visible.length;
                        return (
                            <div key={dayKey(day)} role="gridcell" className={`cloud-month__day${day.getMonth() !== date.getMonth() ? ' is-other' : ''}${sameDay(day, today) ? ' is-today' : ''}`}
                                onClick={(event) => { if (event.target === event.currentTarget) onCreate({ start: withTime(day, '09:00'), end: withTime(day, '10:00') }); }}>
                                <button type="button" className="cloud-month__num" onClick={() => onDay(day)} aria-label={day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}>{day.getDate()}</button>
                                {visible.map((item) => (
                                    <button key={item.key} type="button" className={`cloud-chip${item.allDay ? ' cloud-chip--allday' : ''}`} style={chipStyle(item.calendar.color)} onClick={() => onOpen(item)} title={item.title}>
                                        {!item.allDay && <span className="cloud-chip__time">{sameDay(item.start, day) ? clock(item.start) : ''}</span>}
                                        <span className="cloud-chip__title">{item.title}</span>
                                    </button>
                                ))}
                                {more > 0 && <button type="button" className="cloud-month__more" onClick={() => onDay(day)}>{more} more</button>}
                                {tasks.map((task) => <TaskChip key={task.href} task={task} />)}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function TaskChip({ task }: { task: Task }) {
    return (
        <Link to={`/calendar/tasks?list=${encodeURIComponent(task.calendar.href)}`} className="cloud-chip cloud-chip--task" style={chipStyle(task.calendar.color)} title={t('Task: {title}', { title: task.title })}>
            <i className="bx bx-checkbox" aria-hidden="true" /><span className="cloud-chip__title">{task.title}</span>
        </Link>
    );
}

/* ---------- Week and day ---------- */

const HOUR = 48; // px

/** Side-by-side lanes for events that overlap. */
function lanes(list: { start: number; end: number; key: string }[]): Map<string, { lane: number; of: number }> {
    const out = new Map<string, { lane: number; of: number }>();
    let cluster: { key: string; lane: number }[] = [];
    let clusterEnd = -Infinity;
    let ends: number[] = [];
    const close = () => { const of = Math.max(1, ends.length); cluster.forEach((c) => out.set(c.key, { lane: c.lane, of })); cluster = []; ends = []; };
    [...list].sort((a, b) => a.start - b.start || b.end - a.end).forEach((item) => {
        if (item.start >= clusterEnd) close();
        let lane = ends.findIndex((end) => end <= item.start);
        if (lane === -1) { lane = ends.length; ends.push(item.end); } else ends[lane] = item.end;
        cluster.push({ key: item.key, lane });
        clusterEnd = Math.max(clusterEnd, item.end);
    });
    close();
    return out;
}

function TimeGrid({ days, items, due, onOpen, onDay, onCreate }: {
    days: Date[]; items: Occurrence[]; due: Task[];
    onOpen: (o: Occurrence) => void; onDay: (day: Date) => void; onCreate: (initial: Partial<Draft>) => void;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(new Date());
    useEffect(() => { scroller.current?.scrollTo({ top: HOUR * 7 }); }, []);
    useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);

    const allDay = (day: Date) => items.filter((item) => (item.allDay || item.end.getTime() - item.start.getTime() >= DAY) && touches(item, day));
    const timed = (day: Date) => items.filter((item) => !item.allDay && item.end.getTime() - item.start.getTime() < DAY && touches(item, day));
    const clickSlot = (event: MouseEvent<HTMLDivElement>, day: Date) => {
        if (event.target !== event.currentTarget) return;
        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const minutes = Math.max(0, Math.min(23.5 * 60, Math.floor(y / HOUR * 2) * 30));
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
        onCreate({ start, end: new Date(start.getTime() + 3600000) });
    };
    const hasAllDay = days.some((day) => allDay(day).length > 0 || due.some((t) => t.due && sameDay(t.due, day)));

    return (
        <div className={`cloud-week cloud-week--${days.length === 1 ? 'day' : 'week'}`} style={{ '--days': days.length } as CSSProperties}>
            <div className="cloud-week__head">
                <span className="cloud-week__gutter" />
                {days.map((day) => (
                    <button key={dayKey(day)} type="button" className={`cloud-week__date${sameDay(day, now) ? ' is-today' : ''}`} onClick={() => onDay(day)}>
                        <span>{day.toLocaleDateString(locale, { weekday: 'short' })}</span><strong>{day.getDate()}</strong>
                    </button>
                ))}
            </div>
            {hasAllDay && (
                <div className="cloud-week__allday">
                    <span className="cloud-week__gutter ps-small ps-muted">{t('All day')}</span>
                    {days.map((day) => (
                        <div key={dayKey(day)} className="cloud-week__allday-col">
                            {allDay(day).map((item) => <button key={item.key} type="button" className="cloud-chip cloud-chip--allday" style={chipStyle(item.calendar.color)} onClick={() => onOpen(item)} title={item.title}><span className="cloud-chip__title">{item.title}</span></button>)}
                            {due.filter((t) => t.due && sameDay(t.due, day)).map((task) => <TaskChip key={task.href} task={task} />)}
                        </div>
                    ))}
                </div>
            )}
            <div className="cloud-week__scroll" ref={scroller}>
                <div className="cloud-week__body" style={{ height: HOUR * 24 }}>
                    <div className="cloud-week__gutter cloud-week__hours">
                        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span>)}
                    </div>
                    {days.map((day) => {
                        const list = timed(day);
                        const from = startOfDay(day).getTime();
                        const placed = lanes(list.map((item) => ({ key: item.key, start: Math.max(item.start.getTime(), from), end: Math.max(Math.min(item.end.getTime(), from + DAY), Math.max(item.start.getTime(), from) + 15 * 60000) })));
                        return (
                            <div key={dayKey(day)} className={`cloud-week__col${sameDay(day, now) ? ' is-today' : ''}`} onClick={(event) => clickSlot(event, day)}>
                                {list.map((item) => {
                                    const start = Math.max(item.start.getTime(), from);
                                    const end = Math.min(Math.max(item.end.getTime(), start + 20 * 60000), from + DAY);
                                    const lane = placed.get(item.key) ?? { lane: 0, of: 1 };
                                    const top = (start - from) / 3600000 * HOUR;
                                    const height = Math.max(20, (end - start) / 3600000 * HOUR - 2);
                                    return (
                                        <button key={item.key} type="button" className={`cloud-event${height < 40 ? ' is-short' : ''}`} style={{ ...chipStyle(item.calendar.color), top, height, left: `calc(${lane.lane / lane.of * 100}% + 2px)`, width: `calc(${100 / lane.of}% - 4px)` }} onClick={() => onOpen(item)}>
                                            <strong>{item.title}</strong>
                                            <span>{clock(item.start)} to {clock(item.end)}{item.location ? t(', {location}', { location: item.location }) : ''}</span>
                                        </button>
                                    );
                                })}
                                {sameDay(day, now) && <span className="cloud-week__now" style={{ top: (now.getTime() - from) / 3600000 * HOUR }} />}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ---------- Agenda ---------- */

function Agenda({ days, items, due, onOpen, onMore }: { days: Date[]; items: Occurrence[]; due: Task[]; onOpen: (o: Occurrence) => void; onMore: () => void }) {
    const filled = days.map((day) => ({ day, list: items.filter((item) => touches(item, day)), tasks: due.filter((t) => t.due && sameDay(t.due, day)) })).filter((d) => d.list.length || d.tasks.length);
    return (
        <div className="cloud-agenda">
            {filled.length === 0 && <Empty icon="bx-calendar-check">{t('Nothing in the next 30 days.')}</Empty>}
            {filled.map(({ day, list, tasks }) => (
                <section key={dayKey(day)} className="cloud-agenda__day">
                    <h3 className={sameDay(day, new Date()) ? 'is-today' : ''}><strong>{day.getDate()}</strong><span>{day.toLocaleDateString(locale, { weekday: 'long', month: 'long' })}</span></h3>
                    <ul>
                        {list.map((item) => (
                            <li key={item.key}>
                                <button type="button" className="cloud-agenda__item" style={chipStyle(item.calendar.color)} onClick={() => onOpen(item)}>
                                    <span className="cloud-agenda__time">{item.allDay ? t('All day') : sameDay(item.start, day) ? t('{start} to {end}', { start: clock(item.start), end: clock(item.end) }) : t('Until {end}', { end: clock(item.end) })}</span>
                                    <span className="cloud-agenda__dot" />
                                    <span className="cloud-agenda__text"><strong>{item.title}</strong>{item.location && <span className="ps-small ps-muted">{item.location}</span>}</span>
                                    {item.recurrenceId !== null && <i className="bx bx-repeat ps-muted" aria-label={t('Repeats')} />}
                                </button>
                            </li>
                        ))}
                        {tasks.map((task) => <li key={task.href}><TaskChip task={task} /></li>)}
                    </ul>
                </section>
            ))}
            <div className="cloud-empty-actions"><Button size="sm" onClick={onMore}>{t('The 30 days after')}</Button></div>
        </div>
    );
}

/* ---------- The event editor ---------- */

const REPEATS: [Repeat, string][] = [['none', t('Does not repeat')], ['daily', t('Every day')], ['weekly', t('Every week')], ['monthly', t('Every month')], ['yearly', t('Every year')]];
const REMINDERS: [number | null, string][] = [[null, t('No reminder')], [0, t('At the start')], [5, t('5 minutes before')], [15, t('15 minutes before')], [30, t('30 minutes before')], [60, t('1 hour before')], [120, t('2 hours before')], [1440, t('1 day before')], [2880, t('2 days before')], [10080, t('1 week before')]];
const ALL_DAY_REMINDERS: [number | null, string][] = [[null, t('No reminder')], [-540, t('On the day at 9:00')], [900, t('The day before at 9:00')], [2340, t('2 days before at 9:00')], [9540, t('1 week before at 9:00')]];

function EventEditor({ occurrence, initial, calendars, onClose, onSaved }: Editing & { calendars: Cal[]; onClose: () => void; onSaved: () => void }) {
    const writable = calendars.filter((c) => c.writable && c.events);
    const preferred = writable.find((c) => c.enabled && !c.owner) ?? writable[0];
    const readOnly = occurrence ? occurrence.calendar.subscription || !occurrence.calendar.writable : false;
    const [editing, setEditing] = useState(!occurrence);
    const [stored, setStored] = useState<{ ics: string; etag: string } | null>(null);
    const [draft, setDraft] = useState<Draft | null>(occurrence ? {
        title: occurrence.title, location: occurrence.location, notes: occurrence.notes, allDay: occurrence.allDay,
        start: occurrence.start, end: occurrence.allDay ? new Date(occurrence.end.getTime() - DAY) : occurrence.end,
        repeat: occurrence.recurrenceId === null ? 'none' : 'custom', until: null, reminder: null,
    } : {
        title: '', location: '', notes: '', allDay: false, repeat: 'none', until: null, reminder: 15,
        start: initial?.start ?? withTime(new Date(), '09:00'),
        end: initial?.end ?? new Date((initial?.start ?? withTime(new Date(), '09:00')).getTime() + 3600000),
        ...initial,
    });
    const [calendarHref, setCalendarHref] = useState(occurrence?.calendar.href ?? preferred?.href ?? '');
    const [busy, setBusy] = useState(false);
    const [asking, setAsking] = useState(false);

    useEffect(() => {
        if (!occurrence || readOnly) return;
        caldav.load(occurrence.href).then((loaded) => { setStored(loaded); setDraft(caldav.draftOf(loaded.ics)); }).catch(failed);
    }, [occurrence?.href, readOnly]);

    const change = (changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current));
    const setStart = (start: Date) => setDraft((current) => current && ({ ...current, start, end: new Date(start.getTime() + Math.max(0, current.end.getTime() - current.start.getTime())) }));

    const save = async () => {
        if (!draft) return;
        if (!draft.allDay && draft.end < draft.start) { toast(t('The event ends before it starts.'), 'error'); return; }
        const target = calendars.find((c) => c.href === calendarHref);
        if (!target) { toast(t('Pick a calendar.'), 'error'); return; }
        setBusy(true);
        try {
            if (occurrence && stored) {
                await caldav.updateEvent(occurrence.href, stored.etag, stored.ics, draft);
                if (target.href !== occurrence.calendar.href) await caldav.moveEvent(occurrence.href, target);
            } else {
                await caldav.createEvent(target, draft);
            }
            toast(occurrence ? t('Saved.') : t('Added to your calendar.'));
            onSaved();
        } catch (error) { failed(error); } finally { setBusy(false); }
    };
    const remove = async (only: boolean) => {
        if (!occurrence || !stored) return;
        setBusy(true);
        try {
            if (only) await caldav.skipOccurrence(occurrence);
            else await caldav.remove(occurrence.href, stored.etag);
            toast(t('Deleted.'));
            onSaved();
        } catch (error) { failed(error); } finally { setBusy(false); setAsking(false); }
    };

    const repeats = occurrence?.recurrenceId !== null && occurrence !== undefined;
    const viewing = !!occurrence && !editing;
    const title = !occurrence ? t('New event') : viewing ? t('Event') : t('Edit event');
    const reminders = draft?.allDay ? ALL_DAY_REMINDERS : REMINDERS;
    const cancelEdit = () => {
        if (!occurrence) { onClose(); return; }
        if (stored) setDraft(caldav.draftOf(stored.ics));
        setCalendarHref(occurrence.calendar.href);
        setAsking(false);
        setEditing(false);
    };
    const deleteAction = occurrence && (asking
        ? <span className="cloud-inline">{repeats && <Button variant="danger" size="sm" disabled={busy} onClick={() => remove(true)}>{t('Only this one')}</Button>}<Button variant="danger" size="sm" disabled={busy} onClick={() => remove(false)}>{repeats ? t('All of them') : t('Yes, delete')}</Button><Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t('Keep')}</Button></span>
        : <Button variant="ghost" icon="bx-trash" className="cloud-danger" disabled={!stored || busy} onClick={() => setAsking(true)}>{t('Delete event')}</Button>);
    const footer = draft && !readOnly && (viewing ? (
        <div className="cloud-dialog-actions cloud-dialog-actions--split">
            {deleteAction}
            <span className="cloud-toolbar__spacer" />
            <Button variant="primary" icon="bx-edit-alt" disabled={!stored || busy} onClick={() => setEditing(true)}>{t('Edit event')}</Button>
        </div>
    ) : (
        <div className="cloud-dialog-actions cloud-dialog-actions--split">
            {deleteAction}
            <span className="cloud-toolbar__spacer" />
            <Button onClick={cancelEdit}>{t('Cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={save}>{t('Save')}</Button>
        </div>
    ));

    return (
        <Modal open title={title} onClose={onClose} footer={footer || undefined}>
            {!draft ? <div className="cloud-loading"><span className="ps-loader" /></div> : viewing ? (
                <div className="ps-stack cloud-form cloud-event-readonly">
                    <Field label={t('Title')}><div className="cloud-read-value">{draft.title || t('Busy')}</div></Field>
                    <div className="cloud-cal__when">
                        <Field label={t('Starts')}><div className="cloud-read-value">{formatMoment(draft.start, draft.allDay)}</div></Field>
                        <Field label={t('Ends')}><div className="cloud-read-value">{formatMoment(draft.end, draft.allDay)}</div></Field>
                    </div>
                    <Field label={t('Calendar')}><div className="cloud-read-value"><span className="cloud-dot" style={chipStyle(occurrence!.calendar.color)} />{occurrence!.calendar.name}{occurrence!.calendar.owner ? t(' ({owner})', { owner: occurrence!.calendar.owner }) : ''}</div></Field>
                    {draft.location && <Field label={t('Place')}><div className="cloud-read-value">{draft.location}</div></Field>}
                    {draft.notes && <Field label={t('Notes')}><div className="cloud-read-value cloud-cal__notes">{draft.notes}</div></Field>}
                    {readOnly && <p className="ps-small ps-muted">{t('This calendar is read-only.')}</p>}
                </div>
            ) : (
                <form className="ps-stack cloud-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <Field label={t('Title')} htmlFor="ev-title"><input id="ev-title" className="ps-input" value={draft.title} placeholder={t('What is happening?')} autoFocus onChange={(event) => change({ title: event.target.value })} /></Field>
                    <label className="cloud-inline-switch"><Switch checked={draft.allDay} label={t('All day')} onChange={(allDay) => change({ allDay, reminder: allDay ? (draft.reminder === null ? null : -540) : (draft.reminder === null ? null : 15) })} />{t('All day')}</label>
                    <div className="cloud-cal__when">
                        <Field label={t('Starts')} htmlFor="ev-start">
                            <div className="cloud-inline">
                                <input id="ev-start" type="date" className="ps-input" value={dayKey(draft.start)} onChange={(event) => event.target.value && setStart(withTime(new Date(event.target.value + 'T12:00'), timeInput(draft.start)))} />
                                {!draft.allDay && <input type="time" className="ps-input cloud-time" aria-label={t('Start time')} step={300} value={timeInput(draft.start)} onChange={(event) => event.target.value && setStart(withTime(draft.start, event.target.value))} />}
                            </div>
                        </Field>
                        <Field label={t('Ends')} htmlFor="ev-end">
                            <div className="cloud-inline">
                                <input id="ev-end" type="date" className="ps-input" value={dayKey(draft.end)} min={dayKey(draft.start)} onChange={(event) => event.target.value && change({ end: withTime(new Date(event.target.value + 'T12:00'), timeInput(draft.end)) })} />
                                {!draft.allDay && <input type="time" className="ps-input cloud-time" aria-label={t('End time')} step={300} value={timeInput(draft.end)} onChange={(event) => event.target.value && change({ end: withTime(draft.end, event.target.value) })} />}
                            </div>
                        </Field>
                    </div>
                    <div className="cloud-cal__when">
                        <Field label={t('Repeats')} htmlFor="ev-repeat">
                            <select id="ev-repeat" className="ps-select" value={draft.repeat} onChange={(event) => change({ repeat: event.target.value as Repeat })}>
                                {draft.repeat === 'custom' && <option value="custom">{t('As set on another device')}</option>}
                                {REPEATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </Field>
                        {draft.repeat !== 'none' && draft.repeat !== 'custom' && (
                            <Field label={t('Until')} htmlFor="ev-until" help={t('Leave empty to keep repeating.')}>
                                <input id="ev-until" type="date" className="ps-input" value={draft.until ? dayKey(draft.until) : ''} min={dayKey(draft.start)} onChange={(event) => change({ until: event.target.value ? new Date(event.target.value + 'T12:00') : null })} />
                            </Field>
                        )}
                    </div>
                    {repeats && <p className="ps-small ps-muted"><i className="bx bx-repeat" /> {' '}{t('This event repeats. Changes here apply to every repeat.')}</p>}
                    <Field label={t('Reminder')} htmlFor="ev-reminder">
                        <select id="ev-reminder" className="ps-select" value={draft.reminder === null ? '' : String(draft.reminder)} onChange={(event) => change({ reminder: event.target.value === '' ? null : Number(event.target.value) })}>
                            {!reminders.some(([value]) => value === draft.reminder) && <option value={String(draft.reminder)}>{t('As set on another device')}</option>}
                            {reminders.map(([value, label]) => <option key={label} value={value === null ? '' : String(value)}>{label}</option>)}
                        </select>
                    </Field>
                    <Field label={t('Calendar')} htmlFor="ev-cal">
                        <select id="ev-cal" className="ps-select" value={calendarHref} onChange={(event) => setCalendarHref(event.target.value)}>
                            {writable.map((c) => <option key={c.href} value={c.href}>{c.name}{c.owner ? t(' ({owner})', { owner: c.owner }) : ''}</option>)}
                        </select>
                    </Field>
                    <Field label={t('Place')} htmlFor="ev-place"><input id="ev-place" className="ps-input" value={draft.location} placeholder={t('Where')} onChange={(event) => change({ location: event.target.value })} /></Field>
                    <Field label={t('Notes')} htmlFor="ev-notes"><textarea id="ev-notes" className="ps-textarea" rows={3} value={draft.notes} onChange={(event) => change({ notes: event.target.value })} /></Field>
                    <button type="submit" hidden />
                </form>
            )}
        </Modal>
    );
}

function formatMoment(value: Date, allDay: boolean): string {
    return value.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }) });
}

/* ---------- The calendar list in the sidebar ---------- */

export const COLORS = ['#FC5000', '#E5534B', '#F5B301', '#2EA043', '#14B8A6', '#3B82F6', '#8E7CF0', '#DB2777', '#8A8A8A'];

function CalendarList() {
    const calendars = useCalendars();
    const [editing, setEditing] = useState<Cal | 'new' | 'subscribe' | null>(null);
    const path = usePath();
    const events = (calendars ?? []).filter((c) => c.events || c.birthdays);
    return (
        <div className="cloud-cals">
            {calendars === null && <span className="ps-loader cloud-cals__loading" />}
            {events.map((calendar) => (
                <div key={calendar.href} className="cloud-cals__row">
                    <button type="button" className="cloud-cals__toggle" aria-pressed={calendar.enabled} onClick={() => changeCalendar(calendar, { enabled: !calendar.enabled })} title={calendar.enabled ? t('Hide') : t('Show')}>
                        <span className={`cloud-cals__box${calendar.enabled ? ' is-on' : ''}`} style={chipStyle(calendar.color)}>{calendar.enabled && <i className="bx bx-check" />}</span>
                        <span className="cloud-cals__name">{calendar.name}{calendar.owner && <span className="cloud-cals__owner">{calendar.owner}</span>}</span>
                    </button>
                    {!calendar.birthdays && <button type="button" className="cloud-cals__more" aria-label={t('Settings for {name}', { name: calendar.name })} onClick={() => setEditing(calendar)}><i className="bx bx-dots-horizontal-rounded" /></button>}
                </div>
            ))}
            <button type="button" className="cloud-cals__add" onClick={() => setEditing('new')}><i className="bx bx-plus" />{t('New calendar')}</button>
            <button type="button" className="cloud-cals__add" onClick={() => setEditing('subscribe')}><i className="bx bx-link" />{t('Subscribe')}</button>
            <Link to="/calendar/tasks" className={`ps-nav__item ps-nav__item--sub${path === '/calendar/tasks' ? ' is-active' : ''}`}><i className="bx bx-task" aria-hidden="true" />{t('Tasks')}</Link>
            {editing === 'subscribe' && <SubscriptionDialog onClose={() => setEditing(null)} />}
            {editing && editing !== 'subscribe' && <CalendarDialog calendar={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
        </div>
    );
}

export function CalendarDialog({ calendar, kind = 'events', onClose }: { calendar: Cal | null; kind?: 'events' | 'tasks'; onClose: () => void }) {
    const [name, setName] = useState(calendar?.name ?? '');
    const [color, setColor] = useState(calendar?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
    const [busy, setBusy] = useState(false);
    const [asking, setAsking] = useState(false);
    const noun = kind === 'tasks' || (calendar && !calendar.events) ? 'list' : 'calendar';

    const save = async () => {
        if (!name.trim()) { toast(noun === 'list' ? t('The list needs a name.') : t('The calendar needs a name.'), 'error'); return; }
        setBusy(true);
        try {
            if (calendar) await caldav.updateCalendar(calendar, { name: name.trim(), color });
            else await caldav.createCalendar(name.trim(), color, kind);
            await reloadCalendars();
            onClose();
        } catch (error) { failed(error); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!calendar) return;
        setBusy(true);
        try { await caldav.deleteCalendar(calendar); await reloadCalendars(); toast(calendar.owner ? t('Taken off your list.') : t('Deleted. It stays in the trash for a while.')); onClose(); } catch (error) { failed(error); } finally { setBusy(false); }
    };

    return (
        <Modal open title={calendar ? (noun === 'list' ? t('Task list settings') : t('Calendar settings')) : noun === 'list' ? t('New task list') : t('New calendar')} onClose={onClose} footer={
            <div className="cloud-dialog-actions cloud-dialog-actions--split">
                {calendar && (asking
                    ? <span className="cloud-inline"><Button variant="danger" size="sm" disabled={busy} onClick={remove}>{calendar.owner ? t('Yes, take it off') : t('Yes, delete it')}</Button><Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t('Keep')}</Button></span>
                    : <Button variant="ghost" icon="bx-trash" className="cloud-danger" onClick={() => setAsking(true)}>{calendar.owner ? t('Take off my list') : t('Delete')}</Button>)}
                <span className="cloud-toolbar__spacer" />
                <Button onClick={onClose}>{t('Cancel')}</Button>
                <Button variant="primary" loading={busy} onClick={save}>{calendar ? t('Save') : t('Make it')}</Button>
            </div>
        }>
            <form className="ps-stack cloud-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                <Field label={t('Name')} htmlFor="cal-name"><input id="cal-name" className="ps-input" value={name} disabled={!!calendar?.owner} onChange={(event) => setName(event.target.value)} autoFocus /></Field>
                <Field label={t('Colour')}>
                    <div className="cloud-swatches">
                        {COLORS.map((c) => <button key={c} type="button" className={`cloud-swatch${c.toLowerCase() === color.toLowerCase() ? ' is-active' : ''}`} style={chipStyle(c)} aria-label={c} onClick={() => setColor(c)} />)}
                        <input type="color" className="cloud-swatch cloud-swatch--pick" value={color} aria-label={t('Other colour')} onChange={(event) => setColor(event.target.value)} />
                    </div>
                </Field>
                {calendar && !calendar.owner && <CalendarPeople calendar={calendar} />}
                {calendar?.owner && <p className="ps-small ps-muted">{calendar.owner} {' '}{t('shares this with you')}{calendar.writable ? t(' and you can change it') : ''}{t('. The colour is only yours.')}</p>}
                <button type="submit" hidden />
            </form>
        </Modal>
    );
}

function SubscriptionDialog({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const [busy, setBusy] = useState(false);
    const save = async () => {
        if (!name.trim() || !url.trim()) return;
        setBusy(true);
        try {
            await caldav.subscribeCalendar(name.trim(), url.trim(), color);
            await reloadCalendars();
            toast(t('Calendar subscribed.'));
            onClose();
        } catch (error) { failed(error); } finally { setBusy(false); }
    };
    return <Modal open title={t('Subscribe to calendar')} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" loading={busy} disabled={!name.trim() || !url.trim()} onClick={save}>{t('Subscribe')}</Button></>}>
        <div className="ps-stack">
            <Field label={t('Name')} htmlFor="subscription-name"><input id="subscription-name" className="ps-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></Field>
            <Field label={t('Subscription link')} htmlFor="subscription-url" help={t('Paste an iCal, webcal, or .ics subscription link.')}><input id="subscription-url" className="ps-input" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></Field>
            <Field label={t('Colour')} htmlFor="subscription-color"><input id="subscription-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></Field>
        </div>
    </Modal>;
}

function CalendarPeople({ calendar }: { calendar: Cal }) {
    const [people, setPeople] = useState<CalendarShare[] | null>(null);
    const load = useCallback(() => caldav.calendarShares(calendar).then(setPeople).catch(() => setPeople([])), [calendar.href]);
    useEffect(() => { void load(); }, [load]);
    const set = async (person: string, access: 'read' | 'write' | null, group = false) => {
        try { await caldav.shareCalendar(calendar, person, access, group); await load(); } catch (error) { failed(error); }
    };
    return (
        <div className="ps-stack">
            <h3 className="cloud-subhead">{t('Shared with')}</h3>
            <PeoplePicker itemType="file" filter={plainShowSharee} onPick={(sharee: Sharee) => set(sharee.value.shareWith, 'read', sharee.value.shareType === 1)} />
            {people === null ? <span className="ps-loader" /> : people.length === 0 ? <p className="ps-small ps-muted">{t('Only you see this.')}</p> : (
                <ul className="ps-chain">{people.map((person) => (
                    <li key={person.id} className="ps-row">
                        <span className="ps-row__icon"><i className={`bx ${person.group ? 'bx-group' : 'bx-user'}`} /></span>
                        <span className="ps-row__body"><span className="ps-row__title">{person.name}</span></span>
                        <span className="ps-row__action cloud-row-actions">
                            <select className="ps-select cloud-select--small" value={person.write ? 'write' : 'read'} aria-label={t('What {name} can do', { name: person.name })} onChange={(event) => set(person.id, event.target.value as 'read' | 'write', person.group)}>
                                <option value="read">{t('Can look')}</option><option value="write">{t('Can change')}</option>
                            </select>
                            <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Stop sharing with {name}', { name: person.name })} onClick={() => set(person.id, null, person.group)} />
                        </span>
                    </li>
                ))}</ul>
            )}
        </div>
    );
}
