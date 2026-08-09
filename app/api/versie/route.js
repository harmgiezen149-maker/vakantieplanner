// Welke versie draait er op de server?
//
// De app is een PWA zonder service worker (valkuil 19), dus er is niets dat
// automatisch een update opdringt. Op de telefoon blijft een geopende app
// daardoor makkelijk een week op oude JS hangen — en dat merk je pas als iets
// zich vreemd gedraagt. Deze route geeft de huidige versie; de client vergelijkt
// hem met wat hij bij het laden zag.
//
// Vercel zet VERCEL_GIT_COMMIT_SHA bij elke deploy. Lokaal bestaat die niet en
// blijft de versie 'dev' — dan meldt de app dus nooit een update, wat klopt.

export const dynamic = 'force-dynamic';

export async function GET() {
  const versie =
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || 'dev';

  return Response.json({ versie: String(versie).slice(0, 40) }, {
    // Deze mag onder geen beding uit een cache komen; dan zou hij eeuwig de
    // oude versie melden en is de hele controle zinloos.
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
