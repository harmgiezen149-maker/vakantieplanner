import './globals.css';
import Foutmelder from '@/components/Foutmelder';
import VersieWacht from '@/components/VersieWacht';

export const metadata = {
  title: 'Vakantieplanner',
  description: 'Gedeelde familie-vakantieplanner: dagen, activiteiten, kaart, checklist en inpaklijst',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vakantie',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2D4F3E',
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>
        {/* Vangt browserfouten op en meldt ze; toont zelf niets */}
        <Foutmelder />
        <VersieWacht />
        {children}
      </body>
    </html>
  );
}
