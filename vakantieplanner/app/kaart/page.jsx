import MapView from '@/components/MapView';

export const dynamic = 'force-dynamic';

export default function KaartPage() {
  const authRequired = Boolean(process.env.FAMILY_PIN);
  return <MapView authRequired={authRequired} />;
}
