import { redirect } from 'next/navigation';

// Het foutenlogboek staat sinds de beheerderspagina onder /beheer.
export default function FoutenPage() {
  redirect('/beheer');
}
