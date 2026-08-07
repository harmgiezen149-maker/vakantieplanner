import { maakMomentopname } from '../route';

// Alles ineens downloaden als JSON-bestand. Werkt bewust zónder Blob: dit is
// het pad dat het altijd doet, ook als de opslag niet is ingesteld of eruit
// ligt. Bewaar zo'n bestand af en toe ergens buiten Vercel — dat is de enige
// kopie die een verdwenen account overleeft.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const pin = process.env.FAMILY_PIN;
  if (pin && request.headers.get('x-family-pin') !== pin) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const momentopname = await maakMomentopname();
    const naam = `vakantieplanner-${momentopname.gemaaktOp.slice(0, 10)}.json`;
    return new Response(JSON.stringify(momentopname, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${naam}"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: 'read_failed', detail: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}
