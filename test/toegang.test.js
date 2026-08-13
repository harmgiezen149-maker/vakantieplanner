import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinOk, beheerOk, magBeheren, cronBron } from '../lib/toegang.js';

// De sloten lezen uit process.env, dus die zetten we per test. Alles netjes
// terugdraaien, anders lekt een sleutel naar de volgende test.
function metOmgeving(vars, fn) {
  const oud = {};
  for (const [k, v] of Object.entries(vars)) {
    oud[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(oud)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const verzoek = (headers = {}) => new Request('https://x.test/api/backup/run', { headers });

const GEEN_SLEUTELS = { FAMILY_PIN: null, BEHEER_WACHTWOORD: null, CRON_SECRET: null };

// ── De twee gewone sloten ───────────────────────────────────────────

test('een slot dat niet is ingesteld staat open', () => {
  metOmgeving(GEEN_SLEUTELS, () => {
    assert.equal(pinOk(verzoek()), true);
    assert.equal(beheerOk(verzoek()), true);
    assert.equal(magBeheren(verzoek()), true);
  });
});

test('beheer is een extra laag bovenop de PIN', () => {
  metOmgeving({ ...GEEN_SLEUTELS, FAMILY_PIN: '1234', BEHEER_WACHTWOORD: 'geheim' }, () => {
    assert.equal(magBeheren(verzoek({ 'x-family-pin': '1234' })), false, 'PIN alleen is te weinig');
    assert.equal(magBeheren(verzoek({ 'x-beheer-code': 'geheim' })), false, 'code alleen ook');
    assert.equal(
      magBeheren(verzoek({ 'x-family-pin': '1234', 'x-beheer-code': 'geheim' })), true,
    );
  });
});

// ── De nachtelijke cron ─────────────────────────────────────────────
//
// Dit is de regressie waar het om begonnen was: de cron kreeg elke nacht een
// 401 omdat hij op de familie-PIN werd gecontroleerd, en die stuurt Vercel niet
// mee. Handmatig werkte wél, dus het viel dagen niet op.

test('zonder CRON_SECRET komt Vercels eigen cron erlangs', () => {
  metOmgeving({ ...GEEN_SLEUTELS, FAMILY_PIN: '1234', BEHEER_WACHTWOORD: 'geheim' }, () => {
    assert.equal(cronBron(verzoek({ 'x-vercel-cron': '1' })), 'cron-header');
  });
});

test('een cron zonder enige header komt er niet langs', () => {
  metOmgeving({ ...GEEN_SLEUTELS, FAMILY_PIN: '1234', BEHEER_WACHTWOORD: 'geheim' }, () => {
    assert.equal(cronBron(verzoek()), null);
  });
});

test('met de hand aftrappen kan nog steeds, via de beheerpoort', () => {
  metOmgeving({ ...GEEN_SLEUTELS, FAMILY_PIN: '1234', BEHEER_WACHTWOORD: 'geheim' }, () => {
    assert.equal(
      cronBron(verzoek({ 'x-family-pin': '1234', 'x-beheer-code': 'geheim' })), 'beheer',
    );
    assert.equal(cronBron(verzoek({ 'x-family-pin': '1234' })), null, 'PIN alleen is te weinig');
  });
});

test('met CRON_SECRET is de sleutel leidend', () => {
  metOmgeving({ ...GEEN_SLEUTELS, CRON_SECRET: 's3cr3t' }, () => {
    assert.equal(cronBron(verzoek({ authorization: 'Bearer s3cr3t' })), 'secret');
    assert.equal(cronBron(verzoek({ authorization: 'Bearer fout' })), null);
    assert.equal(cronBron(verzoek({ authorization: 's3cr3t' })), null, 'zonder "Bearer" telt niet');
    assert.equal(
      cronBron(verzoek({ 'x-vercel-cron': '1' })), null,
      'de header telt niet meer zodra er een sleutel is',
    );
  });
});

test('met CRON_SECRET komt zelfs de beheerder er niet zonder sleutel langs', () => {
  metOmgeving({ ...GEEN_SLEUTELS, CRON_SECRET: 's3cr3t', FAMILY_PIN: '1234', BEHEER_WACHTWOORD: 'geheim' }, () => {
    assert.equal(
      cronBron(verzoek({ 'x-family-pin': '1234', 'x-beheer-code': 'geheim' })), null,
    );
  });
});

test('zonder sloten staat ook de cron open', () => {
  metOmgeving(GEEN_SLEUTELS, () => {
    assert.equal(cronBron(verzoek()), 'beheer', 'niets ingesteld = alles open');
  });
});
