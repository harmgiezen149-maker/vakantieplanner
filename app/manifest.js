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
    // Zet de planner in het deelmenu van de telefoon: in Google Maps
    // Delen → Vakantieplanner, en de plek komt op /toevoegen binnen.
    //
    // Methode GET is een bewuste keuze: een POST-deeldoel (nodig voor
    // bestanden) vereist een service worker met een fetch-handler, en die
    // willen we hier niet — zie valkuil 19. Voor een link en wat tekst is GET
    // genoeg.
    //
    // Twee dingen die niet aan de code liggen: dit werkt alleen als de app op
    // het beginscherm is geïnstalleerd, en Safari/iOS ondersteunt Web Share
    // Target helemaal niet. Op een iPhone blijft plakken de weg.
    share_target: {
      action: '/toevoegen',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
    shortcuts: [
      { name: 'Dagoverzicht', url: '/dag', description: 'Vandaag op vakantie' },
      { name: 'Kaart', url: '/kaart', description: 'Activiteiten op de kaart' },
      { name: 'Inpaklijst', url: '/inpakken', description: 'Wat gaat er mee' },
      { name: 'Auto & documenten', url: '/checklist', description: 'Voorbereiding' },
      { name: 'Verblijven', url: '/verblijven', description: 'Waar we zijn geweest' },
    ],
  };
}
