import { del } from '@vercel/blob';

// Een foto uit Vercel Blob verwijderen. Wordt aangeroepen als je een losse
// foto weghaalt én als een heel verblijf wordt verwijderd (dan één keer per
// foto). Best effort: mislukt het, dan verdwijnt de foto wel uit het logboek
// maar blijft het bestand in Blob staan — dat is hinderlijk, niet stuk.

export const dynamic = 'force-dynamic';

export async function DELETE(request) {
  const expectedPin = process.env.FAMILY_PIN;
  if (expectedPin && request.headers.get('x-family-pin') !== expectedPin) {
    return Response.json({ error: 'Ongeldige PIN' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: 'blob_not_configured' }, { status: 501 });
  }

  let urls;
  try {
    const body = await request.json();
    urls = Array.isArray(body?.urls) ? body.urls : [body?.url];
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const valid = urls
    .filter(u => typeof u === 'string' && u.startsWith('https://'))
    .slice(0, 40);

  if (valid.length === 0) {
    return Response.json({ error: 'no_urls' }, { status: 400 });
  }

  try {
    await del(valid);
    return Response.json({ deleted: valid.length });
  } catch (err) {
    return Response.json(
      { error: 'delete_failed', detail: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}
