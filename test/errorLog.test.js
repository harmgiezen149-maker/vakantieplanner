import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseerMelding, voegFoutToe, isRuis, MAX_FOUTEN,
} from '../lib/errorLog.js';

const nu = new Date('2026-08-07T12:00:00Z');
const later = new Date('2026-08-07T12:05:00Z');

const melding = (over = {}, tijd = nu) =>
  normaliseerMelding({ bron: 'client', bericht: 'Kapot', pad: '/verblijven', ...over }, tijd);

test('een melding zonder bericht levert niets op', () => {
  assert.equal(normaliseerMelding({ bericht: '' }), null);
  assert.equal(normaliseerMelding({ bericht: '   ' }), null);
  assert.equal(normaliseerMelding(null), null);
});

test('onbekende bron wordt client', () => {
  assert.equal(melding({ bron: 'iets' }).bron, 'client');
  assert.equal(melding({ bron: 'server' }).bron, 'server');
});

test('lange teksten worden afgekapt', () => {
  const lang = melding({ bericht: 'x'.repeat(500), detail: 'y'.repeat(3000) });
  assert.equal(lang.bericht.length, 300);
  assert.equal(lang.detail.length, 1500);
});

test('dezelfde fout op dezelfde plek wordt één regel met een teller', () => {
  let lijst = voegFoutToe([], melding());
  lijst = voegFoutToe(lijst, melding({}, later));
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0].aantal, 2);
  assert.equal(lijst[0].eerst, nu.toISOString(), 'eerste keer blijft staan');
  assert.equal(lijst[0].laatst, later.toISOString(), 'laatste keer schuift mee');
});

test('dezelfde tekst op een ander pad is een andere fout', () => {
  let lijst = voegFoutToe([], melding({ pad: '/verblijven' }));
  lijst = voegFoutToe(lijst, melding({ pad: '/inpakken' }));
  assert.equal(lijst.length, 2);
});

test('client en server worden apart geteld', () => {
  let lijst = voegFoutToe([], melding({ bron: 'client' }));
  lijst = voegFoutToe(lijst, melding({ bron: 'server' }));
  assert.equal(lijst.length, 2);
});

test('een herhaalde fout schuift naar voren', () => {
  let lijst = voegFoutToe([], melding({ bericht: 'Oud' }));
  lijst = voegFoutToe(lijst, melding({ bericht: 'Nieuw' }));
  assert.equal(lijst[0].bericht, 'Nieuw');
  lijst = voegFoutToe(lijst, melding({ bericht: 'Oud' }, later));
  assert.equal(lijst[0].bericht, 'Oud', 'net herhaald, dus bovenaan');
  assert.equal(lijst.length, 2);
});

test('het nieuwste detail wint, maar een leeg detail wist niets', () => {
  let lijst = voegFoutToe([], melding({ detail: 'eerste spoor' }));
  lijst = voegFoutToe(lijst, melding({ detail: 'tweede spoor' }, later));
  assert.equal(lijst[0].detail, 'tweede spoor');
  lijst = voegFoutToe(lijst, melding({ detail: null }, later));
  assert.equal(lijst[0].detail, 'tweede spoor', 'bestaand spoor blijft');
});

test('de lijst groeit niet oneindig', () => {
  let lijst = [];
  for (let i = 0; i < MAX_FOUTEN + 40; i++) {
    lijst = voegFoutToe(lijst, melding({ bericht: `Fout ${i}` }));
  }
  assert.equal(lijst.length, MAX_FOUTEN);
  assert.equal(lijst[0].bericht, `Fout ${MAX_FOUTEN + 39}`, 'nieuwste bovenaan');
});

test('een lege melding laat de lijst met rust', () => {
  const lijst = [melding()];
  assert.equal(voegFoutToe(lijst, null), lijst);
  assert.deepEqual(voegFoutToe(undefined, null), []);
});

test('ruis wordt niet gemeld', () => {
  assert.equal(isRuis('ResizeObserver loop completed with undelivered notifications'), true);
  assert.equal(isRuis('Script error.'), true);
  assert.equal(isRuis('AbortError: The operation was aborted'), true);
  assert.equal(isRuis(''), true);
  assert.equal(isRuis(null), true);
  // Een echte fout uit onze eigen code moet er wél door
  assert.equal(isRuis("Cannot read properties of undefined (reading 'stays')"), false);
});
