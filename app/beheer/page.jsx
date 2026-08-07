import Beheer from '@/components/Beheer';
import { BeheerPoort } from '@/components/Poort';

export const metadata = {
  title: 'Beheer — Vakantieplanner',
  description: 'Reservekopieën, foutenlogboek en opruimen',
};

export default function BeheerPage() {
  return (
    <BeheerPoort>
      <Beheer />
    </BeheerPoort>
  );
}
