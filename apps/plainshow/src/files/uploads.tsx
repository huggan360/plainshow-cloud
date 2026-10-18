import { useEffect, useState } from 'react';
import { mkdir, upload } from '../api/dav';
import { CloudError } from '../api/http';
import { formatBytes } from '../api/http';
import { toast } from '../toast';

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

async function run() {
    if (running) return;
    running = true;
    while (true) {
        const job = jobs.find((item) => item.state === 'waiting');
        if (!job) break;
        job.state = 'sending';
        publish();
        try {
            await ensureFolder(job.path.split('/').slice(0, -1).join('/'));
            await upload(job.path, job.file, (sent, total) => { job.sent = sent; job.total = total; publish(); });
            job.state = 'done';
            doneListeners.forEach((listener) => listener(job.path.split('/').slice(0, -1).join('/')));
        } catch (error) {
            job.state = 'failed';
            job.error = error instanceof Error ? error.message : 'Upload failed.';
            toast(`${job.name}: ${job.error}`, 'error');
        }
        publish();
    }
    running = false;
    const failed = jobs.filter((job) => job.state === 'failed').length;
    const done = jobs.filter((job) => job.state === 'done').length;
    if (done) toast(`${done} file${done === 1 ? '' : 's'} uploaded.${failed ? ` ${failed} failed.` : ''}`);
    window.setTimeout(() => { jobs = jobs.filter((job) => job.state === 'sending' || job.state === 'waiting'); publish(); }, 4000);
}

/** Queue files (with their folder paths, for folder uploads) into a folder. */
export function queueUploads(folder: string, files: { file: File; relative?: string }[]) {
    files.forEach(({ file, relative }) => {
        const inside = (relative || file.name).replace(/^\/+/, '');
        jobs.push({ id: Math.random(), name: inside, path: [folder, inside].filter(Boolean).join('/'), file, sent: 0, total: file.size, state: 'waiting' });
    });
    publish();
    void run();
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

export function UploadPanel() {
    const [items, setItems] = useState<Job[]>(jobs);
    useEffect(() => { listeners.add(setItems); return () => { listeners.delete(setItems); }; }, []);
    if (!items.length) return null;
    const sent = items.reduce((sum, job) => sum + (job.state === 'done' ? job.total : job.sent), 0);
    const total = items.reduce((sum, job) => sum + job.total, 0) || 1;
    const active = items.filter((job) => job.state === 'waiting' || job.state === 'sending').length;
    return (
        <div className="cloud-uploads" role="status">
            <div className="cloud-uploads__head">
                <i className={`bx ${active ? 'bx-upload' : 'bx-check-circle'}`} aria-hidden="true" />
                <strong>{active ? `Uploading ${active} file${active === 1 ? '' : 's'}` : 'Uploads finished'}</strong>
                <span className="ps-muted ps-small">{formatBytes(sent)} of {formatBytes(total)}</span>
            </div>
            <div className="ps-meter"><span style={{ width: `${Math.round((sent / total) * 100)}%` }} /></div>
            <ul className="cloud-uploads__list">
                {items.slice(-6).map((job) => (
                    <li key={job.id} className={`is-${job.state}`}>
                        <span className="cloud-uploads__name">{job.name}</span>
                        <span className="ps-small ps-muted">{job.state === 'failed' ? job.error : job.state === 'done' ? 'Done' : job.state === 'waiting' ? 'Waiting' : `${Math.round((job.sent / (job.total || 1)) * 100)}%`}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
