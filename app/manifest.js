// Web App Manifest — maakt de vakantieplanner installeerbaar als PWA.
// Next.js serveert dit automatisch op /manifest.webmanifest.

export default function manifest() {
  return {
    name: 'Vakantieplanner',
    short_name: 'Vakantie',
    description: 'Gedeelde familie-vakantieplanner: dagen, activiteiten, kaart, checklist en inpaklijst',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF3E1',
    theme_color: '#2D4F3E',
    lang: 'nl',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dagoverzicht', url: '/dag', description: 'Vandaag op vakantie' },
      { name: 'Kaart', url: '/kaart', description: 'Activiteiten op de kaart' },
      { name: 'Inpaklijst', url: '/inpakken', description: 'Wat gaat er mee' },
      { name: 'Auto & documenten', url: '/checklist', description: 'Voorbereiding' },
    ],
  };
}
