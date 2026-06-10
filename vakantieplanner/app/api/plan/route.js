import { NextResponse } from 'next/server';
import { getRedis, PLAN_KEY, LEGACY_PLAN_KEY } from '@/lib/redis';
import { DEFAULT_TRIP_CONFIG } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Optionele simpele auth via FAMILY_PIN env var
function checkAuth(request) {
  const expectedPin = process.env.FAMILY_PIN;
  if (!expectedPin) return null; // geen auth ingesteld → open
  const provided = request.headers.get('x-family-pin');
  if (provided !== expectedPin) {
    return NextResponse.json({ error: 'Ongeldige PIN' }, { status: 401 });
  }
  return null;
}

function emptyState() {
  return {
    plan: {},
    customActivities: [],
    locationOverrides: {},
    tripConfig: DEFAULT_TRIP_CONFIG,
    updatedAt: null,
    updatedBy: null,
    isInitial: true,
  };
}

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function sanitizeTripConfig(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_TRIP_CONFIG;
  const stays = Array.isArray(raw.stays)
    ? raw.stays.slice(0, 12).map((s, i) => ({
        id: typeof s.id === 'string' ? s.id : `stay_${i}`,
        name: typeof s.name === 'string' ? s.name.slice(0, 60) : `Verblijf ${i + 1}`,
        startDate: typeof s.startDate === 'string' ? s.startDate : null,
        endDate: typeof s.endDate === 'string' ? s.endDate : null,
        coords: Array.isArray(s.coords) && s.coords.length === 2 ? s.coords : null,
        locationLabel: typeof s.locationLabel === 'string' ? s.locationLabel.slice(0, 120) : null,
      }))
    : [];
  return {
    title: typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, 80)
      : DEFAULT_TRIP_CONFIG.title,
    startDate: typeof raw.startDate === 'string' ? raw.startDate : null,
    endDate: typeof raw.endDate === 'string' ? raw.endDate : null,
    stays,
  };
}

export async function GET(request) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;

  try {
    const redis = getRedis();
    let raw = await redis.get(PLAN_KEY);
    let data = normalize(raw);

    // Eenmalige fallback naar de oude key van een eerdere deploy
    if (!data && LEGACY_PLAN_KEY) {
      raw = await redis.get(LEGACY_PLAN_KEY);
      data = normalize(raw);
    }

    if (!data) {
      return NextResponse.json(emptyState());
    }

    return NextResponse.json({
      plan: data.plan || {},
      customActivities: Array.isArray(data.customActivities) ? data.customActivities : [],
      locationOverrides: (data.locationOverrides && typeof data.locationOverrides === 'object') ? data.locationOverrides : {},
      tripConfig: sanitizeTripConfig(data.tripConfig),
      updatedAt: data.updatedAt || null,
      updatedBy: data.updatedBy || null,
      isInitial: !data.tripConfig,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;

  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 });
    }

    const data = {
      plan: body.plan && typeof body.plan === 'object' ? body.plan : {},
      customActivities: Array.isArray(body.customActivities) ? body.customActivities : [],
      locationOverrides: (body.locationOverrides && typeof body.locationOverrides === 'object') ? body.locationOverrides : {},
      tripConfig: sanitizeTripConfig(body.tripConfig),
      updatedAt: new Date().toISOString(),
      updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy.slice(0, 40) : null,
    };

    const redis = getRedis();
    await redis.set(PLAN_KEY, JSON.stringify(data));

    return NextResponse.json({ ...data, isInitial: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
