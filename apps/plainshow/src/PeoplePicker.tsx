import { useEffect, useMemo, useState } from 'react';
import { findPeople, Sharee } from './api/shares';
import { Avatar, Badge } from './ui';
import { t } from './i18n';

type Props = {
    itemType: 'file' | 'folder';
    onPick: (sharee: Sharee) => void;
    filter?: (sharee: Sharee) => boolean;
    placeholder?: string;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
export const plainShowSharee = (sharee: Sharee) => sharee.value.shareType === 0 || (sharee.value.shareType === 1 && /^ps-[1-9][0-9]*$/.test(sharee.value.shareWith));

export function PeoplePicker({ itemType, onPick, filter, placeholder = t('Search people and groups') }: Props) {
    const [search, setSearch] = useState('');
    const [found, setFound] = useState<Sharee[]>([]);
    useEffect(() => {
        let live = true;
        const timer = window.setTimeout(() => {
            findPeople(search.trim(), itemType).then((list) => {
                if (!live) return;
                const unique = new Map(list.filter((sharee) => !filter || filter(sharee)).map((sharee) => [`${sharee.value.shareType}-${sharee.value.shareWith}`, sharee]));
                setFound([...unique.values()]);
            }).catch(() => live && setFound([]));
        }, search.trim() ? 250 : 0);
        return () => { live = false; window.clearTimeout(timer); };
    }, [search, itemType, filter]);

    const groups = useMemo(() => found.filter((sharee) => sharee.value.shareType === 1), [found]);
    const people = useMemo(() => found.filter((sharee) => sharee.value.shareType === 0).slice(0, search.trim() ? 20 : 3), [found, search]);
    const section = (title: string, items: Sharee[]) => items.length > 0 && <div className="cloud-people-picker__section">
        <h4 className="cloud-people-picker__heading">{title}</h4>
        <ul className="ps-chain">{items.map((sharee) => <li key={`${sharee.value.shareType}-${sharee.value.shareWith}`}>
            <button type="button" className="ps-row cloud-picker__row" onClick={() => { onPick(sharee); setSearch(''); }}>
                {sharee.value.shareType === 1
                    ? <span className="cloud-group-avatar"><i className="bx bx-group" /></span>
                    : <Avatar src={sharee.icon} initials={initials(sharee.label)} size="sm" />}
                <span className="ps-row__body"><span className="ps-row__title">{sharee.label}</span>{sharee.shareWithDisplayNameUnique && <span className="ps-row__meta">{sharee.shareWithDisplayNameUnique}</span>}</span>
                {sharee.value.shareType === 1 && <Badge tone="accent">{t('Group')}</Badge>}<i className="bx bx-plus" />
            </button>
        </li>)}</ul>
    </div>;

    return <div className="cloud-people-picker">
        <div className="ps-input-wrap"><i className="bx bx-search" aria-hidden="true" /><input className="ps-input" placeholder={placeholder} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={placeholder} /></div>
        {section('Groups', groups)}
        {section(search.trim() ? t('People') : t('Suggested people'), people)}
    </div>;
}
