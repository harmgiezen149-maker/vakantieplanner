import { handleUpload } from '@vercel/blob/client';

// Client-uploads naar Vercel Blob. De browser stuurt het bestand rechtstreeks
// naar Blob; deze route geeft alleen een kortlevend token af. Daardoor lopen
// foto's niet tegen de body-limiet van een serverless function aan.
//
// Let op: onUploadCompleted vuurt NIET lokaal (Blob moet die callback publiek
// kunnen bereiken). De opslag hangt er daarom niet vanaf — de browser krijgt de
// blob-URL terug van upload() en schrijft die zelf in /api/verblijven.

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      {
        error: 'blob_not_configured',
        detail: 'Fotoopslag is nog niet ingesteld. Voeg in het Vercel-dashboard onder Storage een Blob-store toe aan dit project.',
      },
      { status: 501 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // upload() kan geen eigen headers meesturen, dus de familie-PIN komt
        // mee als clientPayload. Gooien = geen token = geen upload.
        const expectedPin = process.env.FAMILY_PIN;
        if (expectedPin && clientPayload !== expectedPin) {
          throw new Error('Ongeldige PIN');
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          addRandomSuffix: true,
          maximumSizeInBytes: 8 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // Bewust leeg — zie de opmerking bovenaan.
      },
    });

    return Response.json(jsonResponse);
  } catch (err) {
    // 400 zodat Blob de webhook opnieuw probeert bij een echte fout
    return Response.json({ error: String(err?.message ?? err) }, { status: 400 });
  }
}
