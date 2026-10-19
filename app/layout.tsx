import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'PharmaStock | Trouvez vos médicaments', description: 'Disponibilité des médicaments au Togo, Bénin, Burkina Faso et en Côte d’Ivoire.' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="fr"><body>{children}</body></html>; }
