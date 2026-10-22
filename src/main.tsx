import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root')!;
const app = (
  <React.StrictMode>
    <App initialLang={window.location.pathname.startsWith('/en/') ? 'en' : 'zh'} />
  </React.StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
