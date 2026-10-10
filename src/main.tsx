import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './side-quests.css';
import './notification-prompt.css';
import './community-chats.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Could not install adda offline shell:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
