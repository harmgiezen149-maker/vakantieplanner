import { Suspense } from 'react';
import StayLog from '@/components/StayLog';

export const metadata = {
  title: 'Verblijven — Vakantieplanner',
  description: 'Logboek van alle verblijven waar we zijn geweest, met kaart, cijfer en review',
};

export default function VerblijvenPage() {
  // Suspense-grens omdat StayLog `useSearchParams` gebruikt: daarmee vangt hij
  // de plek op die de deelknop via /toevoegen doorstuurt. Zonder deze grens
  // valt de build om op "missing suspense boundary" — zelfde patroon als
  // app/toevoegen/page.jsx.
  return (
    <Suspense fallback={null}>
      <StayLog />
    </Suspense>
  );
}
