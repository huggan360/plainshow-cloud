import { TouchEvent, useEffect, useRef, useState } from 'react';
import { Entry, fileUrl, previewUrl, readText, writeText } from '../api/dav';
import { formatBytes } from '../api/http';
import { boot } from '../boot';
import { failed, toast } from '../toast';
import { Button } from '../ui';
import { kindOf } from './kinds';

/**
 * A PDF in a frame. Cloud sends files as downloads with a strict policy, so
 * the browser's PDF reader gets a copy in memory instead.
 */
export function PdfFrame({ src, title }: { src: string; title: string }) {
    const [url, setUrl] = useState<string | null>(null);
    const [failedToLoad, setFailed] = useState(false);
    useEffect(() => {
        let gone = false;
        let made: string | null = null;
        setUrl(null); setFailed(false);
        fetch(src, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then((response) => { if (!response.ok) throw new Error(); return response.blob(); })
            .then((blob) => { if (gone) return; made = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); setUrl(made); })
            .catch(() => { if (!gone) setFailed(true); });
        return () => { gone = true; if (made) URL.revokeObjectURL(made); };
    }, [src]);
    if (failedToLoad) return <p className="ps-muted">This PDF could not be opened here. Download it instead.</p>;
    return url ? <iframe src={url} title={title} /> : <span className="ps-loader" />;
}

/**
 * A file full screen. Pictures, videos and sound play; PDFs open in the
 * browser's reader; text can be edited and saved. Arrow keys and swipes go
 * to the next and previous file in the list it was opened from.
 */
export default function Viewer({ items, index, onIndex, onClose, onShare, onChanged, title }: {
    items: Entry[]; index: number; onIndex: (index: number) => void; onClose: () => void;
    onShare?: (entry: Entry) => void; onChanged?: () => void; title?: (entry: Entry) => string;
}) {
    const entry = items[index];
    const kind = kindOf(entry.mime, entry.name);
    const [text, setText] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [full, setFull] = useState(false);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const dirty = text !== null && saved !== null && text !== saved;
    const canWrite = !entry.src && entry.permissions.includes('W') && (!boot.public || boot.public.canEdit);
    const canDownload = !boot.public?.hideDownload;

    useEffect(() => {
        let active = true;
        setText(null); setSaved(null); setFull(false);
        if (kind === 'text' || kind === 'code') {
            if (entry.size > 2 * 1024 * 1024 || entry.src) { setText(''); setSaved(''); return; }
            readText(entry.path).then((content) => { if (active) { setText(content); setSaved(content); } }).catch((error) => { if (active) failed(error); });
        }
        return () => { active = false; };
    }, [entry.path, entry.etag]);

    const go = (step: number) => {
        if (dirty && !window.confirm('Leave without saving your changes?')) return;
        const next = index + step;
        if (next >= 0 && next < items.length) onIndex(next);
    };
    const close = () => { if (!dirty || window.confirm('Close without saving your changes?')) onClose(); };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLTextAreaElement) {
                if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save(); }
                if (event.key === 'Escape') close();
                return;
            }
            if (event.key === 'Escape') close();
            if (event.key === 'ArrowRight') go(1);
            if (event.key === 'ArrowLeft') go(-1);
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    });

    const save = async () => {
        if (text === null || !dirty || !canWrite) return;
        setSaving(true);
        try { await writeText(entry.path, text); setSaved(text); toast('Saved.'); onChanged?.(); } catch (error) { failed(error); } finally { setSaving(false); }
    };

    const onTouchStart = (event: TouchEvent) => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; };
    const onTouchEnd = (event: TouchEvent) => {
        if (!touch.current || kind === 'text' || kind === 'code') return;
        const dx = event.changedTouches[0].clientX - touch.current.x;
        const dy = event.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        else if (dy > 120 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
        touch.current = null;
    };

    const src = entry.src ?? fileUrl(entry.path);
    return (
        <div className="cloud-viewer" role="dialog" aria-modal="true" aria-label={entry.name} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <header className="cloud-viewer__bar">
                <Button variant="ghost" iconOnly icon="bx-x" aria-label="Close" onClick={close} />
                <div className="cloud-viewer__title">
                    <strong>{title ? title(entry) : entry.name}</strong>
                    <span className="ps-small ps-muted">{formatBytes(entry.size)}{items.length > 1 ? `, ${index + 1} of ${items.length}` : ''}</span>
                </div>
                {(kind === 'text' || kind === 'code') && text !== null && canWrite && <Button size="sm" variant={dirty ? 'primary' : 'secondary'} loading={saving} disabled={!dirty} onClick={save}>{dirty ? 'Save' : 'Saved'}</Button>}
                {onShare && <Button variant="ghost" iconOnly icon="bx-share-alt" aria-label="Share" onClick={() => onShare(entry)} />}
                {canDownload && <a className="ps-btn ps-btn--ghost ps-btn--icon" href={src} download={entry.name} aria-label="Download"><i className="bx bx-download" /></a>}
            </header>
            <div className={`cloud-viewer__stage cloud-viewer__stage--${kind}`}>
                {kind === 'image' && (
                    <img key={entry.path} src={canDownload && (full || entry.mime === 'image/gif' || entry.mime === 'image/svg+xml') ? src : entry.large ?? previewUrl(entry, 2048, false)} alt={entry.name} onLoad={() => { if (canDownload && !full && entry.mime !== 'image/gif') setFull(true); }} onError={() => { if (canDownload) setFull(true); }} />
                )}
                {kind === 'video' && <video key={entry.path} src={src} controls autoPlay playsInline />}
                {kind === 'audio' && <div className="cloud-viewer__audio"><i className="bx bx-music" /><audio key={entry.path} src={src} controls autoPlay /></div>}
                {kind === 'pdf' && <PdfFrame key={entry.path} src={src} title={entry.name} />}
                {(kind === 'text' || kind === 'code') && (text === null ? <span className="ps-loader" /> : entry.size > 2 * 1024 * 1024 ? <p className="ps-muted">This file is too large to show here. Download it instead.</p> : (
                    <textarea className="cloud-viewer__text" value={text} spellCheck={kind === 'text'} readOnly={!canWrite} onChange={(event) => setText(event.target.value)} />
                ))}
                {!['image', 'video', 'audio', 'pdf', 'text', 'code'].includes(kind) && (
                    <div className="cloud-viewer__none"><i className="bx bx-file-blank" /><p>This file cannot be shown here.</p>{canDownload && <a className="ps-btn ps-btn--primary" href={src} download={entry.name}><i className="bx bx-download" />Download</a>}</div>
                )}
            </div>
            {index > 0 && <button type="button" className="cloud-viewer__nav cloud-viewer__nav--prev" aria-label="Previous" onClick={() => go(-1)}><i className="bx bx-chevron-left" /></button>}
            {index < items.length - 1 && <button type="button" className="cloud-viewer__nav cloud-viewer__nav--next" aria-label="Next" onClick={() => go(1)}><i className="bx bx-chevron-right" /></button>}
        </div>
    );
}
