import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { boot } from './boot';
import './cloud.css';

const PublicShare = lazy(() => import('./public/PublicShare'));

createRoot(document.getElementById('cloud')!).render(boot.public ? <Suspense fallback={null}><PublicShare /></Suspense> : <App />);
