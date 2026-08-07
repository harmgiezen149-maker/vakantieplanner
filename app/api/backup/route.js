import { put, list, del } from '@vercel/blob';
import { getRedis } from '@/lib/redis';
import {
  BACKUP_KEYS, BACKUP_FORMAAT, BACKUP_PREFIX, backupPad, bepaalOpruiming,
} from '@/lib/backup';
import { magBeheren, weigering } from '@/lib/toegang';

// Reservekopieën van alle Redis-documenten, als JSON in Vercel Blob.
//
// GET  → lijst met bestaande momentopnames
// POST → nieuwe momentopname maken en oude opruimen
//
// Wordt dagelijks aangeroepen door de Vercel-cron (zie vercel.json). Die stuurt
// een Authorization-header met CRON_SECRET mee; daarnaast mag je hem met de
// familie-PIN met de hand aftrappen vanaf /reservekopie.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// De cron heeft een eigen sleutel en komt langs beide sloten heen — die
// aanroep komt van Vercel zelf, niet van een browser. Met de hand aftrappen
// vanaf /beheer vraagt wél om de PIN én het beheerderswachtwoord.
function magDitVerzoek(request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return magBeheren(request);
}

function blobOntbreekt() {
  return Response.json({
    error: 'blob_not_configured',
    detail: 'Reservekopieën hebben Vercel Blob nodig. Voeg in het Vercel-dashboard onder Storage een Blob-store toe aan dit project.',
  }, { status: 501 });
}

export async function GET(request) {
  if (!magDitVerzoek(request)) return weigering(request);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return blobOntbreekt();

  try {
    const { blobs } = await list({ prefix: BACKUP_PREFIX, limit: 400 });
    const kopieen = blobs
      .map(b => ({
        pad: b.pathname,
        url: b.url,
        grootte: b.size,
        gemaaktOp: b.uploadedAt,
      }))
      .sort((a, b) => b.pad.localeCompare(a.pad)); // nieuwste eerst
    return Response.json({ kopieen });
  } catch (err) {
    return Response.json(
      { error: 'list_failed', detail: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}

export async function POST(request) {
  if (!magDitVerzoek(request)) return weigering(request);
  return voerBackupUit();
}

// De eigenlijke back-up. Staat apart omdat hij langs twee kanten binnenkomt:
// met de hand via POST hierboven, en dagelijks via GET /api/backup/run — een
// Vercel-cron doet namelijk altijd een GET, nooit een POST.
export async function voerBackupUit() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return blobOntbreekt();

  let momentopname;
  try {
    momentopname = await maakMomentopname();
  } catch (err) {
    return Response.json(
      { error: 'read_failed', detail: String(err?.message ?? err) },
      { status: 502 },
    );
  }

  // Niets opslaan als álle documenten leeg zijn: dan is er waarschijnlijk iets
  // mis met de verbinding, en een lege kopie zou een goede overschrijven.
  const gevuld = BACKUP_KEYS.filter(k => momentopname.documenten[k] != null);
  if (gevuld.length === 0) {
    return Response.json({
      error: 'niets_te_bewaren',
      detail: 'Alle documenten kwamen leeg terug — geen reservekopie gemaakt.',
    }, { status: 422 });
  }

  const pad = backupPad();
  try {
    const blob = await put(pad, JSON.stringify(momentopname), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true, // tweede run op dezelfde dag vervangt de eerste
    });

    const opgeruimd = await ruimOp();

    return Response.json({
      pad: blob.pathname,
      url: blob.url,
      documenten: gevuld,
      opgeruimd,
      gemaaktOp: momentopname.gemaaktOp,
    });
  } catch (err) {
    return Response.json(
      { error: 'write_failed', detail: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}

// Alle documenten uitlezen. Een ontbrekend document wordt null — dat is
// betekenisvol (nog nooit gevuld) en moet geen fout opleveren.
export async function maakMomentopname() {
  const redis = getRedis();
  const documenten = {};
  for (const key of BACKUP_KEYS) {
    const ruw = await redis.get(key);
    documenten[key] = typeof ruw === 'string' ? veiligParse(ruw) : (ruw ?? null);
  }
  return {
    formaat: BACKUP_FORMAAT,
    gemaaktOp: new Date().toISOString(),
    documenten,
  };
}

function veiligParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

async function ruimOp() {
  try {
    const { blobs } = await list({ prefix: BACKUP_PREFIX, limit: 400 });
    const { verwijderen } = bepaalOpruiming(blobs.map(b => b.pathname));
    if (verwijderen.length === 0) return 0;
    const urls = blobs.filter(b => verwijderen.includes(b.pathname)).map(b => b.url);
    await del(urls);
    return urls.length;
  } catch {
    // Opruimen mag mislukken; de nieuwe kopie is het belangrijkst
    return 0;
  }
}
