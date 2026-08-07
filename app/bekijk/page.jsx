import Bekijken from '@/components/Bekijken';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Meekijken — Vakantieplanner',
  description: 'Alleen-lezen weergave van de vakantieplanning',
  // Een gedeelde link hoort niet in Google terecht te komen.
  robots: { index: false, follow: false },
};

// Bewust géén PinPoort: dit is precies de pagina die zonder familie-PIN moet
// werken. De controle zit op het token in /api/delen/bekijk.
export default function BekijkPage() {
  return <Bekijken />;
}
