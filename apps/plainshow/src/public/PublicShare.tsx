import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as dav from '../api/dav';
import { Entry, fileUrl, previewUrl, zipUrl } from '../api/dav';
import { formatBytes } from '../api/http';
import { boot } from '../boot';
import { ICONS, kindOf, viewable } from '../files/kinds';
import Viewer, { PdfFrame } from '../files/Viewer';
import { failed, toast, Toasts } from '../toast';
import { Button, Empty, Frame } from '../ui';
import { t, tn, locale } from '../i18n';

const share = boot.public!;

function useTheme(): [string, () => void] {
    const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
    const toggle = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('plainshow-theme', next); } catch { /* private mode */ }
        setTheme(next);
    };
    return [theme, toggle];
}

/** Where in a shared folder we are: ?dir=/Holiday/Day 1 */
function useDir(): [string, (dir: string) => void] {
    const read = () => (new URLSearchParams(window.location.search).get('dir') ?? share.path ?? '').replace(/^\/+|\/+$/g, '');
    const [dir, setDir] = useState(read);
    useEffect(() => { const onPop = () => setDir(read()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
    const go = (next: string) => {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set('dir', '/' + next); else url.searchParams.delete('dir');
        window.history.pushState(null, '', url);
        setDir(next);
        window.scrollTo({ top: 0 });
    };
    return [dir, go];
}

/** A share link's page: one file, a folder to look through, or a folder to drop files into. */
export default function PublicShare() {
    const [theme, toggleTheme] = useTheme();
    const expires = share.expires ? new Date(share.expires).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    return (
        <div className="cloud-public">
            <header className="cloud-public__bar">
                <a href={boot.platform?.core} className="ps-brand">
                    <img className="ps-brand__logo" src={`${boot.assets}/ui/brand/plainshow-logo.webp?v=${boot.version}`} alt={t('PlainShow')} width="92" height="30" />
                    <span className="ps-brand__suffix">{t('Cloud')}</span>
                </a>
                <span className="cloud-toolbar__spacer" />
                <Button variant="ghost" iconOnly icon={theme === 'light' ? 'bx-moon' : 'bx-sun'} aria-label={theme === 'light' ? t('Dark theme') : t('Light theme')} onClick={toggleTheme} />
            </header>
            <main className="cloud-public__main">
                <div className="ps-page-head">
                    <div>
                        <h1 className="ps-page-head__title cloud-public__title">{share.name}</h1>
                        <p className="ps-page-head__text">
                            {share.owner ? <>{t('Shared with you by')}{' '}<strong>{share.owner}</strong></> : t('Shared with you')}
                            {expires && <>{t('. The link works until')}{' '}{expires}</>}
                        </p>
                    </div>
                </div>
                {share.note && <Frame compact className="cloud-public__note"><p><i className="bx bx-message-square-detail" /> {share.note}</p></Frame>}
                {!share.folder ? <OneFile /> : share.canRead ? <Folder /> : <DropOnly />}
            </main>
            <footer className="cloud-public__foot ps-small ps-muted">{t('PlainShow Cloud,')}{' '}<a href={boot.platform?.core}>{(boot.platform?.core ?? '').replace(/^https?:\/\//, '')}</a></footer>
            <Toasts />
        </div>
    );
}

/* ---------- One file ---------- */

function OneFile() {
    const [entry, setEntry] = useState<Entry | null>(null);
    const [text, setText] = useState<string | null>(null);
    const kind = kindOf(share.mime, share.name);
    useEffect(() => { dav.stat('').then(setEntry).catch(failed); }, []);
    useEffect(() => {
        if ((kind === 'text' || kind === 'code') && share.size < 512 * 1024) dav.readText('').then(setText).catch(() => setText(null));
    }, []);
    const src = fileUrl('');
    const stub = { id: entry?.id ?? 0, etag: entry?.etag ?? '', path: '' };

    return (
        <Frame flush className="cloud-public__file">
            <div className={`cloud-public__stage cloud-public__stage--${kind}`}>
                {kind === 'image' && <img src={share.mime === 'image/gif' || share.mime === 'image/svg+xml' ? src : previewUrl(stub, 2048, false)} alt={share.name} />}
                {kind === 'video' && <video src={src} controls playsInline preload="metadata" />}
                {kind === 'audio' && <div className="cloud-viewer__audio"><i className="bx bx-music" /><audio src={src} controls /></div>}
                {kind === 'pdf' && <PdfFrame src={src} title={share.name} />}
                {(kind === 'text' || kind === 'code') && (text !== null ? <pre className="cloud-public__text">{text}</pre> : <BigIcon kind={kind} />)}
                {!viewable(kind) && <BigIcon kind={kind} />}
            </div>
            <div className="cloud-public__filebar">
                <span className="cloud-name__icon"><i className={`bx ${ICONS[kind]} cloud-icon--${kind}`} /></span>
                <span className="cloud-public__fileinfo"><strong>{share.name}</strong><span className="ps-small ps-muted">{formatBytes(share.size)}</span></span>
                {!share.hideDownload && <a className="ps-btn ps-btn--primary" href={src} download={share.name}><i className="bx bx-download" />{t('Download')}</a>}
            </div>
        </Frame>
    );
}

function BigIcon({ kind }: { kind: ReturnType<typeof kindOf> }) {
    return <div className="cloud-public__big"><i className={`bx ${ICONS[kind]} cloud-icon--${kind}`} /></div>;
}

/* ---------- A folder ---------- */

function Folder() {
    const [dir, go] = useDir();
    const [items, setItems] = useState<Entry[] | null>(null);
    const [grid, setGrid] = useState(() => { try { return localStorage.getItem('cloud-public-grid') === '1'; } catch { return false; } });
    const [viewing, setViewing] = useState<number | null>(null);
    const [uploading, setUploading] = useState<{ name: string; sent: number; total: number }[]>([]);
    const [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const sending = useRef(false);

    const load = useCallback(() => {
        setItems(null);
        dav.list(dir).then(({ items }) => setItems(items.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true })))).catch((error) => { failed(error); setItems([]); });
    }, [dir]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { try { localStorage.setItem('cloud-public-grid', grid ? '1' : '0'); } catch { /* private mode */ } }, [grid]);

    const send = async (files: File[]) => {
        if (!share.canUpload || files.length === 0 || sending.current) return;
        sending.current = true;
        let uploaded = 0;
        for (const file of files) {
            setUploading((list) => [...list, { name: file.name, sent: 0, total: file.size }]);
            try {
                await dav.upload([dir, file.name].filter(Boolean).join('/'), file, (sent, total) => setUploading((list) => list.map((u) => (u.name === file.name ? { ...u, sent, total } : u))));
                uploaded++;
            } catch (error) { failed(error); }
            setUploading((list) => list.filter((u) => u.name !== file.name));
        }
        sending.current = false;
        if (uploaded) toast(tn(uploaded, 'One file uploaded.', '{n} files uploaded.'));
        load();
    };
    const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void send(Array.from(event.dataTransfer.files)); };

    const parts = dir.split('/').filter(Boolean);
    const files = (items ?? []).filter((item) => !item.folder);
    const open = (item: Entry) => {
        if (item.folder) { go(item.path); return; }
        if (viewable(kindOf(item.mime, item.name))) setViewing(files.indexOf(item));
        else if (!share.hideDownload) window.location.href = fileUrl(item.path);
    };

    return (
        <div onDragOver={(event) => { if (share.canUpload) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <div className="cloud-toolbar">
                <nav className="cloud-crumbs" aria-label={t('Folders')}>
                    <button type="button" onClick={() => go('')}><i className="bx bxs-folder cloud-icon--folder" />{share.name}</button>
                    {parts.map((part, index) => <span key={index} className="cloud-inline"><i className="bx bx-chevron-right" /><button type="button" onClick={() => go(parts.slice(0, index + 1).join('/'))}>{part}</button></span>)}
                </nav>
                <div className="cloud-segment" role="group" aria-label={t('View')}>
                    <button type="button" className={!grid ? 'is-active' : ''} aria-label={t('List')} onClick={() => setGrid(false)}><i className="bx bx-list-ul" /></button>
                    <button type="button" className={grid ? 'is-active' : ''} aria-label={t('Grid')} onClick={() => setGrid(true)}><i className="bx bx-grid-alt" /></button>
                </div>
                {share.canUpload && <><Button icon="bx-upload" onClick={() => input.current?.click()}>{t('Upload')}</Button><input ref={input} type="file" multiple hidden onChange={(event) => { void send(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></>}
                {!share.hideDownload && <a className="ps-btn ps-btn--primary" href={zipUrl(dir)} download><i className="bx bx-download" />{dir ? t('Download this folder') : t('Download all')}</a>}
            </div>
            {uploading.length > 0 && <Frame compact className="cloud-public__uploads">{uploading.map((u) => <div key={u.name} className="cloud-public__upload"><span>{u.name}</span><span className="ps-small ps-muted">{Math.round(u.sent / Math.max(1, u.total) * 100)}%</span></div>)}</Frame>}
            <Frame flush className={dragging ? 'is-drop' : ''}>
                {items === null ? <div className="cloud-loading"><span className="ps-loader" /></div> : items.length === 0 ? <Empty icon="bx-folder-open">{share.canUpload ? t('Nothing here yet. Drop files to add them.') : t('This folder is empty.')}</Empty> : grid ? (
                    <div className="cloud-grid">
                        {items.map((item) => (
                            <div key={item.path} className="cloud-tile">
                                <button type="button" className="cloud-tile__open" onClick={() => open(item)}><span className="cloud-tile__thumb"><Thumb entry={item} size={256} /></span></button>
                                <div className="cloud-tile__foot"><span className="cloud-tile__name" title={item.name}>{item.name}</span>{!item.folder && !share.hideDownload && <a className="ps-btn ps-btn--ghost ps-btn--icon ps-btn--sm" href={fileUrl(item.path)} download={item.name} aria-label={t('Download {name}', { name: item.name })}><i className="bx bx-download" /></a>}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="ps-table-wrap">
                        <table className="ps-table cloud-table">
                            <thead><tr><th>{t('Name')}</th><th className="cloud-col-size">{t('Size')}</th><th className="cloud-col-date">{t('Changed')}</th><th className="cloud-col-actions"><span className="ps-sr-only">{t('Download')}</span></th></tr></thead>
                            <tbody>{items.map((item) => (
                                <tr key={item.path}>
                                    <td><button type="button" className="cloud-name" onClick={() => open(item)}><span className="cloud-name__icon"><Thumb entry={item} size={64} /></span><span className="cloud-name__text">{item.name}</span></button></td>
                                    <td className="cloud-col-size ps-muted">{formatBytes(item.size)}</td>
                                    <td className="cloud-col-date ps-muted">{item.modified ? new Date(item.modified).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
                                    <td className="cloud-col-actions">{!share.hideDownload && <a className="ps-btn ps-btn--ghost ps-btn--icon ps-btn--sm" href={item.folder ? zipUrl(item.path) : fileUrl(item.path)} download={item.folder ? `${item.name}.zip` : item.name} aria-label={t('Download {name}', { name: item.name })}><i className="bx bx-download" /></a>}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </Frame>
            {items && items.length > 0 && <p className="cloud-summary ps-small ps-muted">{items.filter((i) => i.folder).length} {' '}{t('folders,')}{' '}{files.length} {' '}{t('files,')}{' '}{formatBytes(items.reduce((sum, i) => sum + i.size, 0))}</p>}
            {viewing !== null && files[viewing] && <Viewer items={files} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
        </div>
    );
}

function Thumb({ entry, size }: { entry: Entry; size: number }) {
    const [broken, setBroken] = useState(false);
    const kind = kindOf(entry.mime, entry.name);
    if (!entry.folder && (entry.preview || kind === 'image') && !broken) return <img className="cloud-thumb" src={previewUrl(entry, size)} alt="" loading="lazy" onError={() => setBroken(true)} />;
    return <i className={`bx ${ICONS[kind]} cloud-icon--${kind}`} aria-hidden="true" />;
}

/* ---------- Drop files only ---------- */

function DropOnly() {
    const [sent, setSent] = useState<string[]>([]);
    const [busy, setBusy] = useState<{ name: string; percent: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const sending = useRef(false);
    const send = async (files: File[]) => {
        if (!share.canUpload || sending.current) return;
        sending.current = true;
        for (const file of files) {
            setBusy({ name: file.name, percent: 0 });
            try {
                await dav.upload(file.name, file, (done, total) => setBusy({ name: file.name, percent: Math.round(done / Math.max(1, total) * 100) }));
                setSent((list) => [...list, file.name]);
            } catch (error) { failed(error); }
        }
        setBusy(null);
        sending.current = false;
    };
    return (
        <Frame>
            <div className={`cloud-public__drop${dragging ? ' is-drop' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void send(Array.from(event.dataTransfer.files)); }}>
                <i className="bx bx-cloud-upload" aria-hidden="true" />
                <p><strong>{t('Drop files here')}</strong>{share.owner ? t(' for {owner}', { owner: share.owner }) : ''}.</p>
                <p className="ps-small ps-muted">{t('Only')}{' '}{share.owner || t('the owner')} {' '}{t('sees what is in this folder.')}</p>
                <Button variant="primary" icon="bx-upload" loading={!!busy} onClick={() => input.current?.click()}>{t('Choose files')}</Button>
                <input ref={input} type="file" multiple hidden onChange={(event) => { void send(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
                {busy && <p className="ps-small">{busy.name}: {busy.percent}%</p>}
            </div>
            {sent.length > 0 && <ul className="ps-chain">{sent.map((name, index) => <li key={index} className="ps-row"><span className="ps-row__icon"><i className="bx bx-check-circle cloud-ok" /></span><span className="ps-row__body"><span className="ps-row__title">{name}</span><span className="ps-row__meta">{t('Sent')}</span></span></li>)}</ul>}
        </Frame>
    );
}
