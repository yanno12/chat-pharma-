import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaSupport from './pwa-support';
import './globals.css';

export const metadata: Metadata = {
  title: 'PharmaStock | Trouvez vos médicaments',
  description:
    'Trouvez des médicaments et gérez votre pharmacie à travers l’Afrique.',
  applicationName: 'PharmaStock',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'PharmaStock',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      {
        url: '/pwa-icon?size=192&v=2',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/pwa-icon?size=512&v=2',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/pwa-icon?size=180&v=2',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#064b78',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <PwaSupport />
        {children}
      </body>
    </html>
  );
}
