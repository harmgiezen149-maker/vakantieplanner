import { put } from '@vercel/blob';
import { getRedis } from '@/lib/redis';
import { BACKUP_KEYS, BACKUP_PREFIX, valideerMomentopname } from '@/lib/backup';
import { maakMomentopname } from '../route';
import { magBeheren, weigering } from '@/lib/toegang';

// Een momentopname terugzetten. Dit overschrijft de huidige documenten, dus:
//
// 1. het verzoek moet expliciet `bevestigd: true` meesturen,
// 2. vlak vóór het overschrijven wordt de HUIDIGE staat als veiligheidskopie
//    weggeschreven, zodat een verkeerde keuze terug te draaien is.
//
// Die tweede stap is het verschil tussen een reservekopie en een val: zonder
// die kopie maakt één misklik jaren logboek onherstelbaar kwijt.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  // Overschrijft alles. Dit is precies waarvoor het beheerderswachtwoord bestaat.
  if (!magBeheren(request)) return weigering(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body?.bevestigd !== true) {
    return Response.json({
      error: 'niet_bevestigd',
      detail: 'Terugzetten overschrijft de huidige gegevens en moet expliciet bevestigd worden.',
    }, { status: 400 });
  }

  // Bron: een opgeslagen momentopname (url) of een meegestuurd bestand
  let momentopname = body.momentopname ?? null;
  if (!momentopname && body.url) {
    try {
      const res = await fetch(body.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      momentopname = await res.json();
    } catch (err) {
      return Response.json(
        { error: 'ophalen_mislukt', detail: String(err?.message ?? err) },
        { status: 502 },
      );
    }
  }

  const fout = valideerMomentopname(momentopname);
  if (fout) return Response.json({ error: 'ongeldig', detail: fout }, { status: 422 });

  // Veiligheidskopie van de huidige staat, vóór we iets overschrijven
  let veiligheidskopie = null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Geen Blob = nergens om de huidige staat te bewaren. Dan alleen doorgaan
    // als de aanroeper uitdrukkelijk zegt dat te accepteren; anders zou een
    // misklik onherstelbaar zijn en dat is precies wat we willen voorkomen.
    if (body?.zonderVeiligheidskopie !== true) {
      return Response.json({
        error: 'geen_opslag_voor_veiligheidskopie',
        detail: 'Zonder Vercel Blob kan de huidige staat nergens worden veiliggesteld. Download eerst zelf een kopie via "Alles downloaden" en stuur dan zonderVeiligheidskopie mee.',
      }, { status: 409 });
    }
  } else {
    try {
      const huidig = await maakMomentopname();
      const stempel = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = await put(
        `${BACKUP_PREFIX}voor-terugzetten-${stempel}.json`,
        JSON.stringify(huidig),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false },
      );
      veiligheidskopie = blob.url;
    } catch (err) {
      // Geen veiligheidskopie = niet terugzetten. Liever weigeren dan een
      // onomkeerbare actie zonder vangnet uitvoeren.
      return Response.json({
        error: 'geen_veiligheidskopie',
        detail: `Kon de huidige staat niet veiligstellen (${String(err?.message ?? err)}), dus er is niets overschreven.`,
      }, { status: 502 });
    }
  }

  try {
    const redis = getRedis();
    const teruggezet = [];
    for (const key of BACKUP_KEYS) {
      if (!(key in momentopname.documenten)) continue;
      const waarde = momentopname.documenten[key];
      if (waarde == null) continue; // niets weten is geen reden om te wissen
      await redis.set(key, JSON.stringify(waarde));
      teruggezet.push(key);
    }
    return Response.json({
      teruggezet,
      veiligheidskopie,
      uitMomentopname: momentopname.gemaaktOp ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: 'schrijven_mislukt', detail: String(err?.message ?? err), veiligheidskopie },
      { status: 502 },
    );
  }
}
