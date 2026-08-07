import { redirect } from 'next/navigation';

// De reservekopieën wonen sinds de beheerderspagina onder /beheer. Deze route
// blijft bestaan zodat bestaande bladwijzers en snelkoppelingen blijven werken.
export default function ReservekopiePage() {
  redirect('/beheer');
}
