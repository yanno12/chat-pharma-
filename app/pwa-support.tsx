'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

export default function PwaSupport() {
  const [en, setEn] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [instructions, setInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [workerError, setWorkerError] = useState(false);

  const t = (fr: string, english: string) => en ? english : fr;

  useEffect(() => {
    function syncLanguage() {
      setEn(document.documentElement.lang.startsWith('en'));
    }

    syncLanguage();

    const observer = new MutationObserver(syncLanguage);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const nav = navigator as Navigator & { standalone?: boolean };

    function syncInstalled() {
      setInstalled(displayMode.matches || nav.standalone === true);
    }

    function syncConnection() {
      setOffline(!navigator.onLine);
    }

    function handlePrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setPrompt(null);
    }

    syncInstalled();
    syncConnection();

    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (
        navigator.platform === 'MacIntel' &&
        navigator.maxTouchPoints > 1
      )
    );

    try {
      setDismissed(
        sessionStorage.getItem('pharmastock-install-dismissed') === 'yes'
      );
    } catch {
      setDismissed(false);
    }

    displayMode.addEventListener('change', syncInstalled);
    window.addEventListener('online', syncConnection);
    window.addEventListener('offline', syncConnection);
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if (
      process.env.NODE_ENV === 'production' &&
      'serviceWorker' in navigator
    ) {
      void navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      }).catch(() => {
        setWorkerError(true);
      });
    }

    return () => {
      displayMode.removeEventListener('change', syncInstalled);
      window.removeEventListener('online', syncConnection);
      window.removeEventListener('offline', syncConnection);
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);

    try {
      sessionStorage.setItem('pharmastock-install-dismissed', 'yes');
    } catch {
      // Dismissal still works for the current page.
    }
  }

  async function install() {
    if (!prompt) {
      setInstructions(value => !value);
      return;
    }

    setInstalling(true);

    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setInstructions(true);
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }

  const showInstall = !installed && !dismissed && (prompt !== null || ios);

  return (
    <>
      {offline && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '10px 16px',
            background: '#fff4e6',
            color: '#864005',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {t(
            'Vous êtes hors ligne. Les recherches et modifications de stock nécessitent Internet.',
            'You are offline. Searches and stock updates require internet.'
          )}
        </p>
      )}

      {workerError && (
        <p role="status" style={{ padding: '8px 16px', fontSize: 12 }}>
          {t(
            'La préparation du mode application a échoué. Vérifiez votre connexion et actualisez la page.',
            'App installation setup failed. Check your connection and refresh the page.'
          )}
        </p>
      )}

      {showInstall && (
        <div
          style={{
            padding: '8px 14px',
            background: '#eaf7f2',
            borderBottom: '1px solid #dce5eb',
            color: '#17364d',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              maxWidth: 1184,
              margin: '0 auto',
            }}
          >
            <span style={{ fontSize: 12 }}>
              {t(
                'PharmaStock sur votre écran d’accueil',
                'PharmaStock on your home screen'
              )}
            </span>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={installing}
                onClick={() => void install()}
                style={{
                  padding: '7px 12px',
                  background: '#064b78',
                  borderColor: '#064b78',
                  color: 'white',
                  fontSize: 12,
                }}
              >
                {installing
                  ? '…'
                  : t('Installer', 'Install')}
              </button>

              <button
                type="button"
                onClick={dismiss}
                aria-label={t('Fermer', 'Close')}
                style={{
                  padding: '7px 10px',
                  background: 'transparent',
                  fontSize: 12,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {instructions && (
            <p
              role="status"
              style={{
                maxWidth: 1184,
                margin: '10px auto 0',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {ios
                ? t(
                    'Sur iPhone ou iPad, ouvrez ce site dans Safari, touchez Partager, puis « Sur l’écran d’accueil » et « Ajouter ». Selon votre version, activez « Ouvrir comme app web » si proposé.',
                    'On iPhone or iPad, open this site in Safari, tap Share, then “Add to Home Screen” and “Add”. Enable “Open as Web App” if offered.'
                  )
                : t(
                    'Ouvrez le menu de votre navigateur et cherchez « Installer » ou « Ajouter à l’écran d’accueil ».',
                    'Open your browser menu and look for “Install” or “Add to Home screen”.'
                  )}
            </p>
          )}
        </div>
      )}
    </>
  );
}
