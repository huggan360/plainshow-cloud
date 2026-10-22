import { useEffect, useState } from 'react';
import { t } from './i18n';

type Toast = { id: number; kind: 'success' | 'error'; message: string };
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function publish() { listeners.forEach((listener) => listener(toasts)); }

/** A short message at the corner: toast('Saved.') or toast('Could not save.', 'error'). */
export function toast(message: string, kind: 'success' | 'error' = 'success') {
    const item = { id: Date.now() + Math.random(), kind, message };
    toasts = [...toasts.slice(-2), item];
    publish();
    window.setTimeout(() => { toasts = toasts.filter((t) => t.id !== item.id); publish(); }, kind === 'error' ? 6000 : 4000);
}

export function failed(error: unknown) {
    toast(error instanceof Error ? error.message : t('Something went wrong.'), 'error');
}

export function Toasts() {
    const [items, setItems] = useState<Toast[]>(toasts);
    useEffect(() => { listeners.add(setItems); return () => { listeners.delete(setItems); }; }, []);
    return (
        <div className="ps-toasts" aria-live="polite">
            {items.map((item) => (
                <div key={item.id} className="ps-toast" role={item.kind === 'error' ? 'alert' : 'status'}>
                    <i className={`bx ${item.kind === 'error' ? 'bx-error-circle cloud-toast--error' : 'bx-check-circle cloud-toast--ok'}`} aria-hidden="true" />
                    <span>{item.message}</span>
                </div>
            ))}
        </div>
    );
}
