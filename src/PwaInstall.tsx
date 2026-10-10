import { useEffect, useState } from 'react';
import { Check, Download, Smartphone } from 'lucide-react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => isInstalled());

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setPrompt(null);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(ios
      ? 'To install adda, tap Share in Safari, then choose “Add to Home Screen”.'
      : 'To install adda, open your browser menu and choose “Install adda” or “Add to Home screen”.');
  };

  return { installed, install };
}

export function InstallAppButton({ onInstall, compact = false }: { onInstall: () => void; compact?: boolean }) {
  return <button type="button" className={`install-app-button${compact ? ' compact' : ''}`} onClick={onInstall} aria-label="Install adda on this device"><Download size={15}/><span><span className="install-app-label">Install adda</span><span className="install-app-compact-label"><Smartphone size={16}/></span></span></button>;
}

export function InstallAppCard({ installed, onInstall }: { installed: boolean; onInstall: () => void }) {
  return <section className="install-app-card" aria-labelledby="install-app-title">
    <div className="install-app-card-icon"><Smartphone size={17}/></div>
    <div className="install-app-card-copy">
      <strong id="install-app-title">{installed ? 'Adda is on this device' : 'Make adda your own app'}</strong>
      <p>{installed ? 'Open it from your home screen or apps list whenever you want to see your people.' : 'Install adda for its own app window and a quicker way back to your people.'}</p>
      {installed
        ? <span className="install-app-installed"><Check size={14}/> INSTALLED</span>
        : <InstallAppButton onInstall={onInstall}/>}
    </div>
  </section>;
}
