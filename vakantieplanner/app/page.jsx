import Planner from '@/components/Planner';

export default function Page() {
  const authRequired = Boolean(process.env.FAMILY_PIN);
  return <Planner authRequired={authRequired} />;
}
