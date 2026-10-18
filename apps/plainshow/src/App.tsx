import { lazy, Suspense } from 'react';
import Files, { Trash } from './files/Files';
import { usePath } from './router';
import Shell from './Shell';
import { Empty } from './ui';

const Photos = lazy(() => import('./photos/Photos'));
const Calendar = lazy(() => import('./calendar/Calendar'));
const Settings = lazy(() => import('./settings/Settings'));

/** Which part of Cloud the address asks for. */
function Page({ path }: { path: string }) {
    if (path === '/' || path === '/files') return <Files view="folder" path="" />;
    if (path.startsWith('/files/')) return <Files view="folder" path={path.slice('/files/'.length)} />;
    if (path === '/recent') return <Files view="recent" path="" />;
    if (path === '/favorites') return <Files view="favorites" path="" />;
    if (path === '/shared/with-you') return <Files view="with-you" path="" />;
    if (path === '/shared/by-you') return <Files view="by-you" path="" />;
    if (path === '/trash') return <Trash />;
    if (path.startsWith('/photos')) return <Photos path={path} />;
    if (path.startsWith('/calendar')) return <Calendar path={path} />;
    if (path.startsWith('/settings')) return <Settings path={path} />;
    return <Empty icon="bx-map">Nothing lives at this address.</Empty>;
}

export default function App() {
    const path = usePath();
    return (
        <Shell>
            <Suspense fallback={<div className="cloud-loading"><span className="ps-loader" /></div>}>
                <Page path={path} />
            </Suspense>
        </Shell>
    );
}
