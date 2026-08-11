import Uitleg from '@/components/Uitleg';
import { PinPoort } from '@/components/Poort';

export const metadata = {
  title: 'Uitleg — Vakantieplanner',
  description: 'Hoe de vakantieplanner werkt, in zeventien punten',
};

// Achter de PIN, net als de rest van de app: dit is de handleiding voor het
// gezin. De pagina zelf bevat geen enkele gegeven uit de planning en haalt ook
// niets op — het is puur tekst en nagebouwde voorbeelden.
export default function UitlegPage() {
  return (
    <PinPoort controle="/api/plan">
      <Uitleg />
    </PinPoort>
  );
}
