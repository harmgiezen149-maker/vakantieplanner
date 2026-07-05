import DayOverview from '@/components/DayOverview';

export const metadata = {
  title: 'Dagoverzicht — Vakantieplanner',
  description: 'Overzicht van de geplande activiteiten per vakantiedag, met route',
};

export default function DagPage() {
  return <DayOverview />;
}
