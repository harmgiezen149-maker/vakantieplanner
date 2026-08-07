import { voerBackupUit } from '../route';

// Het adres dat de dagelijkse Vercel-cron aanroept (zie vercel.json).
// Crons doen altijd een GET, daarom staat dit los van de POST op /api/backup.
//
// Vercel stuurt `Authorization: Bearer $CRON_SECRET` mee als die variabele is
// ingesteld. Staat hij niet ingesteld, dan valt de controle terug op de
// familie-PIN — en is de app zelf ook al open.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    const pin = process.env.FAMILY_PIN;
    if (pin && request.headers.get('x-family-pin') !== pin) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  return voerBackupUit();
}
