import Uitgaven from '@/components/Uitgaven';
import { PinPoort } from '@/components/Poort';

export const metadata = {
  title: 'Uitgaven — Vakantieplanner',
  description: 'Wat de reis kost, per categorie en per persoon',
};

export default function UitgavenPage() {
  return (
    <PinPoort controle="/api/uitgaven">
      <Uitgaven />
    </PinPoort>
  );
}
