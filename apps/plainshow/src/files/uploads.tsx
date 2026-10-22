import { useEffect, useState } from 'react';
import { mkdir, upload } from '../api/dav';
import { CloudError } from '../api/http';
import { formatBytes } from '../api/http';
import { toast } from '../toast';
import { t, tn } from '../i18n';

/** Uploads run one at a time in the background; the panel shows how far each one is. */
type Job = { id: number; name: string; path: string; file: File; sent: number; total: number; state: 'waiting' | 'sending' | 'done' | 'failed'; error?: string };

let jobs: Job[] = [];
let running = false;
const listeners = new Set<(jobs: Job[]) => void>();
const doneListeners = new Set<(folder: string) => void>();

function publish() { listeners.forEach((listener) => listener([...jobs])); }

/** Called with a folder whenever an upload into it finishes, so the list can refresh. */
export function onUploaded(listener: (folder: string) => void) {
    doneListeners.add(listener);
    return () => { doneListeners.delete(listener); };
}

/** Folders known to exist, so folder uploads create each one only once. */
const made = new Set<string>(['']);
async function ensureFolder(folder: string) {
    const parts = folder.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
        const path = parts.slice(0, i).join('/');
        if (made.has(path)) continue;
        try {
            await mkdir(path);
        } catch (error) {
            if (!(error instanceof CloudError) || error.status !== 405) throw error; // 405: already there
        }
        made.add(path);
    }
}

/** Bytes sent so far, over time, for the speed and the time left. */
let samples: { at: number; bytes: number }[] = [];
const sentBytes = () => jobs.reduce((sum, job) => sum + (job.state === 'done' ? job.total : job.state === 'sending' ? job.sent : 0), 0);
function sample() {
    const now = Date.now();
    samples.push({ at: now, bytes: sentBytes() });
    samples = samples.filter((item) => now - item.at <= 8000);
}

async function run() {
    if (running) return;
    running = true;
    samples = [];
    while (true) {
        const job = jobs.find((item) => item.state === 'waiting');
        if (!job) break;
        job.state = 'sending';
        job.sent = 0;
        publish();
        try {
            await ensureFolder(job.path.split('/').slice(0, -1).join('/'));
            await upload(job.path, job.file, (sent, total) => { job.sent = sent; job.total = total; sample(); publish(); });
            job.state = 'done';
            doneListeners.forEach((listener) => listener(job.path.split('/').slice(0, -1).join('/')));
        } catch (error) {
            job.state = 'failed';
            job.error = error instanceof Error ? error.message : t('Upload failed.');
        }
        sample();
        publish();
    }
    running = false;
    const failed = jobs.filter((job) => job.state === 'failed').length;
    if (failed) toast(tn(failed, 'One file could not be uploaded.', '{n} files could not be uploaded.'), 'error');
}

/** Queue files (with their folder paths, for folder uploads) into a folder. */
export function queueUploads(folder: string, files: { file: File; relative?: string }[]) {
    // A new batch after everything finished starts a fresh list.
    if (!jobs.some((job) => job.state === 'waiting' || job.state === 'sending')) jobs = jobs.filter((job) => job.state === 'failed');
    files.forEach(({ file, relative }) => {
        const inside = (relative || file.name).replace(/^\/+/, '');
        jobs.push({ id: Math.random(), name: inside, path: [folder, inside].filter(Boolean).join('/'), file, sent: 0, total: file.size, state: 'waiting' });
    });
    showPanel();
    publish();
    void run();
}

function retry(job?: Job) {
    jobs.forEach((item) => { if (item.state === 'failed' && (!job || item === job)) { item.state = 'waiting'; item.error = undefined; item.sent = 0; } });
    publish();
    void run();
}
function cancel(job?: Job) {
    jobs = jobs.filter((item) => item.state !== 'waiting' || (job && item !== job));
    publish();
}
function clearFinished() {
    jobs = jobs.filter((job) => job.state === 'waiting' || job.state === 'sending');
    publish();
}

/** The files and folders dropped on the page, with the paths of what was inside folders. */
export async function droppedFiles(data: DataTransfer): Promise<{ file: File; relative: string }[]> {
    const out: { file: File; relative: string }[] = [];
    const entries = Array.from(data.items).map((item) => item.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
    if (!entries.length) return Array.from(data.files).map((file) => ({ file, relative: file.name }));
    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
            out.push({ file, relative: prefix + file.name });
        } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            let batch: FileSystemEntry[];
            do {
                batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
                for (const child of batch) await walk(child, prefix + entry.name + '/');
            } while (batch.length);
        }
    };
    for (const entry of entries) await walk(entry, '');
    return out;
}

/* ---------- The panel ---------- */

type View = 'open' | 'small' | 'hidden';
let view: View = (() => { try { return (localStorage.getItem('cloud-uploads-view') as View) || 'open'; } catch { return 'open'; } })();
const viewListeners = new Set<(view: View) => void>();
function setView(next: View) {
    view = next;
    try { if (next !== 'hidden') localStorage.setItem('cloud-uploads-view', next); } catch { /* private mode */ }
    viewListeners.forEach((listener) => listener(next));
}
/** New uploads bring a hidden panel back (in the size it had). */
function showPanel() {
    if (view === 'hidden') setView((() => { try { return (localStorage.getItem('cloud-uploads-view') as View) || 'open'; } catch { return 'open'; } })());
}

function duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
}

const STATE_ICON: Record<Job['state'], string> = { waiting: 'bx-time-five', sending: 'bx-loader-alt bx-spin', done: 'bx-check-circle', failed: 'bx-error-circle' };

export function UploadPanel() {
    const [items, setItems] = useState<Job[]>(jobs);
    const [mode, setMode] = useState<View>(view);
    const [, tick] = useState(0);
    useEffect(() => { listeners.add(setItems); viewListeners.add(setMode); return () => { listeners.delete(setItems); viewListeners.delete(setMode); }; }, []);
    const active = items.filter((job) => job.state === 'waiting' || job.state === 'sending').length;
    // Refresh the speed and time left once a second while sending.
    useEffect(() => { if (!active) return; const timer = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(timer); }, [active]);
    if (!items.length) return null;

    const done = items.filter((job) => job.state === 'done').length;
    const failed = items.filter((job) => job.state === 'failed').length;
    const waiting = items.filter((job) => job.state === 'waiting').length;
    const total = items.reduce((sum, job) => sum + job.total, 0) || 1;
    const sent = items.reduce((sum, job) => sum + (job.state === 'done' ? job.total : job.state === 'sending' ? job.sent : 0), 0);
    const percent = Math.min(100, Math.round((sent / total) * 100));
    const first = samples[0];
    const last = samples[samples.length - 1];
    const speed = first && last && last.at - first.at > 500 ? (last.bytes - first.bytes) / ((last.at - first.at) / 1000) : 0;
    const remaining = items.filter((job) => job.state !== 'done' && job.state !== 'failed').reduce((sum, job) => sum + job.total - (job.state === 'sending' ? job.sent : 0), 0);
    const left = speed > 0 ? duration(remaining / speed) : '';

    const title = active ? t('Uploading {active} of {n}', { active, n: items.length })
        : failed ? t('{failed} of {n} failed', { failed, n: items.length }) : tn(done, 'One file uploaded', '{n} files uploaded');
    const detail = active
        ? [t('{sent} of {total}', { sent: formatBytes(sent), total: formatBytes(total) }), speed > 0 ? `${formatBytes(speed)}/s` : '', left ? t('about {time} left', { time: left }) : ''].filter(Boolean).join(', ')
        : t('{size} in total', { size: formatBytes(total) });
    const close = () => { if (active) setView('hidden'); else { clearFinished(); } };

    if (mode === 'hidden') {
        return active ? (
            <button type="button" className="cloud-uploads-pill" onClick={() => setView('open')} aria-label={t('Show uploads')}>
                <i className="bx bx-upload" aria-hidden="true" /><span>{percent}%</span>
                <span className="cloud-uploads-pill__bar"><span style={{ width: `${percent}%` }} /></span>
            </button>
        ) : null;
    }

    return (
        <section className={`cloud-uploads${mode === 'small' ? ' is-small' : ''}${failed && !active ? ' has-failed' : ''}`} aria-label={t('Uploads')} role="status">
            <header className="cloud-uploads__head">
                <span className={`cloud-uploads__icon${active ? ' is-active' : failed ? ' is-failed' : ' is-done'}`}>
                    <i className={`bx ${active ? 'bx-upload' : failed ? 'bx-error' : 'bx-check'}`} aria-hidden="true" />
                </span>
                <span className="cloud-uploads__title"><strong>{title}</strong><span>{detail}</span></span>
                <button type="button" className="cloud-uploads__btn" aria-label={mode === 'small' ? t('Show the list') : t('Make smaller')} title={mode === 'small' ? t('Show the list') : t('Make smaller')} onClick={() => setView(mode === 'small' ? 'open' : 'small')}>
                    <i className={`bx ${mode === 'small' ? 'bx-chevron-up' : 'bx-chevron-down'}`} />
                </button>
                <button type="button" className="cloud-uploads__btn" aria-label={active ? t('Hide') : t('Close')} title={active ? t('Hide (uploads carry on)') : t('Close')} onClick={close}><i className="bx bx-x" /></button>
            </header>
            <div className="cloud-uploads__bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
            {mode === 'open' && <>
                <ul className="cloud-uploads__list">
                    {items.map((job) => {
                        const folder = job.path.split('/').slice(0, -1).join('/');
                        const share = job.total ? Math.round((job.sent / job.total) * 100) : 0;
                        return (
                            <li key={job.id} className={`cloud-upload is-${job.state}`}>
                                <i className={`bx ${STATE_ICON[job.state]} cloud-upload__state`} aria-hidden="true" />
                                <span className="cloud-upload__body">
                                    <span className="cloud-upload__name" title={job.path}>{job.name.split('/').pop()}</span>
                                    <span className="cloud-upload__meta">
                                        {job.state === 'failed' ? job.error : [formatBytes(job.total), folder ? t('in {folder}', { folder }) : t('in All files')].join(', ')}
                                    </span>
                                    {job.state === 'sending' && <span className="cloud-upload__bar"><span style={{ width: `${share}%` }} /></span>}
                                </span>
                                <span className="cloud-upload__end">
                                    {job.state === 'sending' && t('{share}%', { share: share })}
                                    {job.state === 'waiting' && <button type="button" className="cloud-uploads__link" onClick={() => cancel(job)}>{t('Cancel')}</button>}
                                    {job.state === 'failed' && <button type="button" className="cloud-uploads__link" onClick={() => retry(job)}>{t('Retry')}</button>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <footer className="cloud-uploads__foot">
                    <span>{[done && t('{n} done', { n: done }), active && t('{n} to go', { n: active }), failed && t('{n} failed', { n: failed })].filter(Boolean).join(', ')}</span>
                    <span className="cloud-uploads__actions">
                        {failed > 0 && <button type="button" className="cloud-uploads__link" onClick={() => retry()}>{t('Retry failed')}</button>}
                        {waiting > 1 && <button type="button" className="cloud-uploads__link" onClick={() => cancel()}>{t('Cancel waiting')}</button>}
                        {done + failed > 0 && <button type="button" className="cloud-uploads__link" onClick={clearFinished}>{t('Clear finished')}</button>}
                    </span>
                </footer>
            </>}
        </section>
    );
}
