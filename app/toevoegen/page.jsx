import { Suspense } from 'react';
import DeelOntvangen from '@/components/DeelOntvangen';
import { PinPoort } from '@/components/Poort';

// Doel van de deelknop uit het manifest (share_target). Heet bewust niet
// /deel: "delen" betekent in deze app al de meekijk-link (/api/delen, /bekijk)
// en die twee door elkaar halen is vragen om ellende.

export const metadata = {
  title: 'Gedeeld met de planner — Vakantieplanner',
  description: 'Een plek die vanuit een andere app is gedeeld toevoegen',
};

export default function ToevoegenPage() {
  return (
    <PinPoort>
      {/* useSearchParams eist een Suspense-grens in de App Router; zonder deze
          valt de build om op "missing suspense boundary". */}
      <Suspense fallback={null}>
        <DeelOntvangen />
      </Suspense>
    </PinPoort>
  );
}
