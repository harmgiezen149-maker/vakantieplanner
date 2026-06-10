import './globals.css';

export const metadata = {
  title: 'Vakantieplanner',
  description: 'Gedeelde familie-vakantieplanner: dagen, activiteiten, kaart, checklist en inpaklijst',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
