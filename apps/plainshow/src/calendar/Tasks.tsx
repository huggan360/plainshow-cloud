import { CSSProperties, useEffect, useMemo, useState } from 'react';
import * as caldav from '../api/caldav';
import { dayKey, Task } from '../api/caldav';
import { navigate, useQuery } from '../router';
import { PageHead } from '../Shell';
import { failed, toast } from '../toast';
import { Button, Empty, Field, Frame, Modal } from '../ui';
import { CalendarDialog, useCalendars } from './Calendar';

const startOfToday = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };

function dueLabel(due: Date): { text: string; late: boolean } {
    const days = Math.round((due.getTime() - startOfToday().getTime()) / 86400000);
    if (days === 0) return { text: 'Today', late: false };
    if (days === 1) return { text: 'Tomorrow', late: false };
    if (days === -1) return { text: 'Yesterday', late: true };
    const sameYear = due.getFullYear() === new Date().getFullYear();
    return { text: due.toLocaleDateString('en-GB', { weekday: days > 0 && days < 7 ? 'long' : undefined, day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }), late: days < 0 };
}

/** Task lists: add, tick off, edit. Due dates show on the calendar. */
export default function Tasks() {
    const calendars = useCalendars();
    const query = useQuery();
    const lists = useMemo(() => (calendars ?? []).filter((c) => c.tasks), [calendars]);
    const list = lists.find((c) => c.href === query.get('list')) ?? lists[0];
    const [items, setItems] = useState<Task[] | null>(null);
    const [title, setTitle] = useState('');
    const [due, setDue] = useState('');
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Task | null>(null);
    const [showDone, setShowDone] = useState(false);
    const [dialog, setDialog] = useState<'new' | 'settings' | null>(null);

    const load = () => { if (list) caldav.tasks(list).then(setItems).catch((error) => { failed(error); setItems([]); }); };
    useEffect(() => { setItems(null); load(); }, [list?.href]);

    const open = (items ?? []).filter((t) => !t.done).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.title.localeCompare(b.title));
    const done = (items ?? []).filter((t) => t.done).sort((a, b) => (b.completed?.getTime() ?? 0) - (a.completed?.getTime() ?? 0));

    const add = async () => {
        if (!list || !title.trim()) return;
        setAdding(true);
        try {
            await caldav.saveTask(list, { title, due: due ? new Date(due + 'T12:00') : null });
            setTitle(''); setDue(''); load();
        } catch (error) { failed(error); } finally { setAdding(false); }
    };
    const tick = async (task: Task) => {
        setItems((current) => current && current.map((t) => (t.href === task.href ? { ...t, done: !t.done, completed: t.done ? null : new Date() } : t)));
        try { await caldav.saveTask(task.calendar, { done: !task.done }, task); load(); } catch (error) { failed(error); load(); }
    };

    if (calendars === null) return <div><PageHead title="Tasks" /><div className="cloud-loading"><span className="ps-loader" /></div></div>;
    if (!list) {
        return (
            <div>
                <PageHead title="Tasks" />
                <Empty icon="bx-task">
                    You have no task lists yet.
                    <div className="cloud-empty-actions"><Button variant="primary" icon="bx-plus" onClick={() => setDialog('new')}>Make a task list</Button></div>
                </Empty>
                {dialog && <CalendarDialog calendar={null} kind="tasks" onClose={() => setDialog(null)} />}
            </div>
        );
    }

    return (
        <div className="cloud-tasks">
            <PageHead title="Tasks" text={list.owner ? `${list.name}, shared by ${list.owner}` : undefined} actions={<Button variant="ghost" icon="bx-cog" onClick={() => setDialog('settings')}>List settings</Button>} />
            <div className="ps-tabs cloud-tasks__lists" role="tablist" aria-label="Task lists">
                {lists.map((c) => (
                    <button key={c.href} type="button" role="tab" aria-selected={c.href === list.href} className={`ps-tab${c.href === list.href ? ' is-active' : ''}`} onClick={() => navigate(`/calendar/tasks?list=${encodeURIComponent(c.href)}`, true)}>
                        <span className="cloud-dot" style={{ '--cal': c.color } as CSSProperties} />{c.name}
                    </button>
                ))}
                <button type="button" className="ps-tab" onClick={() => setDialog('new')}><i className="bx bx-plus" />New list</button>
            </div>
            <Frame flush>
                {list.writable && (
                    <form className="cloud-tasks__add" onSubmit={(event) => { event.preventDefault(); void add(); }}>
                        <i className="bx bx-plus" aria-hidden="true" />
                        <input className="ps-input" placeholder="Add a task" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="New task" />
                        <input type="date" className="ps-input cloud-tasks__due" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due date" />
                        <Button type="submit" variant="primary" size="sm" loading={adding} disabled={!title.trim()}>Add</Button>
                    </form>
                )}
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : (
                    <ul className="cloud-tasks__list">
                        {open.length === 0 && <li className="cloud-tasks__none ps-muted">Nothing left to do here.</li>}
                        {open.map((task) => <TaskRow key={task.href} task={task} onTick={() => tick(task)} onOpen={() => setEditing(task)} />)}
                    </ul>
                )}
                {done.length > 0 && (
                    <>
                        <button type="button" className="cloud-tasks__done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                            <i className={`bx ${showDone ? 'bx-chevron-down' : 'bx-chevron-right'}`} />Done ({done.length})
                        </button>
                        {showDone && <ul className="cloud-tasks__list cloud-tasks__list--done">{done.map((task) => <TaskRow key={task.href} task={task} onTick={() => tick(task)} onOpen={() => setEditing(task)} />)}</ul>}
                    </>
                )}
            </Frame>
            {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
            {dialog && <CalendarDialog calendar={dialog === 'new' ? null : list} kind="tasks" onClose={() => setDialog(null)} />}
        </div>
    );
}

function TaskRow({ task, onTick, onOpen }: { task: Task; onTick: () => void; onOpen: () => void }) {
    const label = task.due ? dueLabel(task.due) : null;
    return (
        <li className={`cloud-task${task.done ? ' is-done' : ''}`}>
            <button type="button" className="cloud-task__check" aria-label={task.done ? 'Mark as not done' : 'Mark as done'} aria-pressed={task.done} disabled={!task.calendar.writable} onClick={onTick} style={{ '--cal': task.calendar.color } as CSSProperties}>
                <i className={`bx ${task.done ? 'bxs-check-circle' : 'bx-circle'}`} />
            </button>
            <button type="button" className="cloud-task__body" onClick={onOpen}>
                <span className="cloud-task__title">{task.title || 'Untitled task'}</span>
                {task.notes && <span className="cloud-task__notes">{task.notes}</span>}
            </button>
            {label && !task.done && <span className={`cloud-task__due${label.late ? ' is-late' : ''}`}><i className="bx bx-calendar" />{label.text}</span>}
        </li>
    );
}

function TaskEditor({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState(task.title);
    const [notes, setNotes] = useState(task.notes);
    const [due, setDue] = useState(task.due ? dayKey(task.due) : '');
    const [busy, setBusy] = useState(false);
    const [asking, setAsking] = useState(false);
    const readOnly = !task.calendar.writable;

    const save = async () => {
        if (!title.trim()) { toast('A task needs a title.', 'error'); return; }
        setBusy(true);
        try { await caldav.saveTask(task.calendar, { title, notes, due: due ? new Date(due + 'T12:00') : null }, task); onSaved(); } catch (error) { failed(error); } finally { setBusy(false); }
    };
    const remove = async () => {
        setBusy(true);
        try { await caldav.removeTask(task); toast('Deleted.'); onSaved(); } catch (error) { failed(error); } finally { setBusy(false); }
    };

    return (
        <Modal open title={readOnly ? 'Task' : 'Edit task'} onClose={onClose} footer={!readOnly && (
            <div className="cloud-dialog-actions cloud-dialog-actions--split">
                {asking
                    ? <span className="cloud-inline"><Button variant="danger" size="sm" disabled={busy} onClick={remove}>Yes, delete</Button><Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Keep</Button></span>
                    : <Button variant="ghost" icon="bx-trash" className="cloud-danger" onClick={() => setAsking(true)}>Delete</Button>}
                <span className="cloud-toolbar__spacer" />
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={save}>Save</Button>
            </div>
        ) || undefined}>
            <form className="ps-stack cloud-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                <Field label="Title" htmlFor="task-title"><input id="task-title" className="ps-input" value={title} readOnly={readOnly} onChange={(event) => setTitle(event.target.value)} autoFocus /></Field>
                <Field label="Due" htmlFor="task-due" help="It shows on the calendar that day.">
                    <div className="cloud-inline">
                        <input id="task-due" type="date" className="ps-input" value={due} readOnly={readOnly} onChange={(event) => setDue(event.target.value)} />
                        {due && !readOnly && <Button variant="ghost" size="sm" onClick={() => setDue('')}>No date</Button>}
                    </div>
                </Field>
                <Field label="Notes" htmlFor="task-notes"><textarea id="task-notes" className="ps-textarea" rows={4} value={notes} readOnly={readOnly} onChange={(event) => setNotes(event.target.value)} /></Field>
                <button type="submit" hidden />
            </form>
        </Modal>
    );
}
