import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';
import { weerOmschrijving } from '@/lib/weer';
import { pinOk, weigering } from '@/lib/toegang';

// Weersverwachting per dag, via Open-Meteo.
//
// Geen sleutel en geen account nodig — dat is de reden dat het deze is en niet
// een van de andere. Wel een eigen, korte bewaartermijn: de cache uit
// lib/geoCache.js houdt dingen normaal maandenlang vast, en een verwachting
// van vorige week is erger dan geen verwachting.
//
// GET ?lat=&lng=&van=YYYY-MM-DD&tot=YYYY-MM-DD → { dagen: [{ datum, minC, maxC,
//   neerslagMm, code, emoji, label }] }

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Open-Meteo levert alleen een verwachting voor ongeveer de komende twee weken.
// Vragen om augustus volgend jaar geeft geen fout maar een leeg antwoord; dat
// vangen we hier af zodat de client niet op een lege lijst hoeft te wachten.
const MAX_DAGEN_VOORUIT = 16;

function dagenTussen(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export async function GET(request) {
  if (!pinOk(request)) return weigering(request);

  const p = new URL(request.url).searchParams;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const van = p.get('van') || '';
  const tot = p.get('tot') || van;

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'invalid_coords' }, { status: 400 });
  }
  if (!DATUM.test(van) || !DATUM.test(tot) || tot < van) {
    return Response.json({ error: 'invalid_dates' }, { status: 400 });
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  if (dagenTussen(vandaag, van) > MAX_DAGEN_VOORUIT) {
    // Geen fout: er ís gewoon nog geen verwachting. De pagina toont dan niets.
    return Response.json({ dagen: [], reden: 'te_ver_vooruit' });
  }

  const sleutel = cacheSleutel('weer', [lat, lng, van, tot]);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return Response.json(bewaard);

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'
    + `&timezone=auto&start_date=${van}&end_date=${tot}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return Response.json({ error: 'weer_failed', status: res.status }, { status: 502 });
    }
    const raw = await res.json();
    const d = raw?.daily;
    if (!d?.time?.length) return Response.json({ dagen: [] });

    const dagen = d.time.map((datum, i) => {
      const code = d.weather_code?.[i];
      const { emoji, label } = weerOmschrijving(code);
      return {
        datum,
        minC: d.temperature_2m_min?.[i] ?? null,
        maxC: d.temperature_2m_max?.[i] ?? null,
        neerslagMm: d.precipitation_sum?.[i] ?? null,
        code: code ?? null,
        emoji,
        label,
      };
    });

    const payload = { dagen };
    if (dagen.length) await naarCache(sleutel, payload, TTL.weer);
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: 'weer_failed', detail: String(err?.message ?? err) }, { status: 502 });
  }
}
