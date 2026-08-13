import { voerBackupUit } from '../route';
import { meldServerFout } from '@/app/api/fouten/route';
import { cronBron } from '@/lib/toegang';

// Het adres dat de dagelijkse Vercel-cron aanroept (zie vercel.json).
// Crons doen altijd een GET, daarom staat dit los van de POST op /api/backup.
//
// **Een cron heeft geen familie-PIN.** Hij komt uit een datacenter, niet uit een
// browser met localStorage. Deze route controleerde daar ooit wél op, met als
// gevolg: elke nacht een 401 en dagenlang geen reservekopie, zonder een spoor.
// De regel staat nu in cronBron() in lib/toegang.js — zie de uitleg daar.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const bron = cronBron(request);

  if (!bron) {
    // Een geweigerde nachtelijke taak hoort geen stilte op te leveren: dan denk
    // je dat je beschermd bent. Eén regel in het foutenlogboek, dat zelf al op
    // boodschap dedupliceert, dus het loopt niet vol.
    await meldServerFout(
      'Nachtelijke reservekopie geweigerd (geen geldige cron-toegang)',
      'Controleer CRON_SECRET in Vercel, of of de aanroep van de Vercel-cron komt.',
      '/api/backup/run',
    );
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = await voerBackupUit();

  if (!res.ok) {
    let detail = null;
    try { detail = JSON.stringify(await res.clone().json()); } catch { /* laat leeg */ }
    await meldServerFout(
      `Nachtelijke reservekopie mislukt (status ${res.status})`,
      detail,
      '/api/backup/run',
    );
    return res;
  }

  // Zonder CRON_SECRET is `x-vercel-cron` de enige aanwijzing dat dit de cron
  // is, en die header kan een buitenstaander meesturen. De kopie maken is dan
  // ongevaarlijk, maar het antwoord bevat normaal een **publieke** blob-URL naar
  // de hele planning — die houden we in dat geval binnen.
  if (bron === 'cron-header') {
    try {
      const { pad, url, ...rest } = await res.clone().json();
      return Response.json({ ok: true, ...rest });
    } catch {
      return Response.json({ ok: true });
    }
  }

  return res;
}
