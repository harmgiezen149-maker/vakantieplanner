import Planner from '@/components/Planner';
import { PinPoort } from '@/components/Poort';

// De PIN-poort staat sinds de beheerderspagina om de pagina heen in plaats van
// binnenin Planner. Zo kan elke pagina er dezelfde poort omheen zetten — vroeger
// kon alleen dit beginscherm om een PIN vragen, en liep je op /reservekopie
// tegen 401's aan zonder manier om in te loggen.
export default function Page() {
  return (
    <PinPoort>
      <Planner />
    </PinPoort>
  );
}
