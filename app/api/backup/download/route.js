import { maakMomentopname } from '../route';
import { magBeheren, weigering } from '@/lib/toegang';

// Alles ineens downloaden als JSON-bestand. Werkt bewust zónder Blob: dit is
// het pad dat het altijd doet, ook als de opslag niet is ingesteld of eruit
// ligt. Bewaar zo'n bestand af en toe ergens buiten Vercel — dat is de enige
// kopie die een verdwenen account overleeft.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Dit levert álle documenten in één bestand — dus beheer, niet alleen de PIN.
  if (!magBeheren(request)) return weigering(request);

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
