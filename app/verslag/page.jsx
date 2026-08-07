import Reisverslag from '@/components/Reisverslag';
import { PinPoort } from '@/components/Poort';

export const metadata = {
  title: 'Terugblik — Vakantieplanner',
  description: 'Nachten, landen en cijfers uit het verblijvenlogboek',
};

export default function VerslagPage() {
  return (
    <PinPoort controle="/api/verblijven">
      <Reisverslag />
    </PinPoort>
  );
}
