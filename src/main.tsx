import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './notification-prompt.css';
import './community-chats.css';

// Canonicalize ephemeral Cloudflare Pages preview hosts (e.g. 5c06376f.student-addit.pages.dev)
// to prevent duplicate origins, background zombie workers, and duplicate notifications.
const isEphemeralPreviewHost = /^[a-f0-9]{8}\.student-addit\.pages\.dev$/i.test(window.location.hostname);
if (isEphemeralPreviewHost) {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => void reg.unregister());
    });
  }
  const canonicalUrl = 'https://development.student-addit.pages.dev' + window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(canonicalUrl);
}

if (!isEphemeralPreviewHost && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      void reg.update();
    }).catch((error) => {
      console.error('Could not install adda offline shell:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
window.dispatchEvent(new Event('adda:app-ready'));
