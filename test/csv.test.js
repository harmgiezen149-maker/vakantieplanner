import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/csv.js';

// De inpaklijst-import leest CSV. Nederlands Excel exporteert met een
// puntkomma; ging dat mis, dan kwam de hele lijst in één kolom terecht.

test('herkent puntkomma als scheiding (Nederlands Excel)', () => {
  assert.deepEqual(
    parseCsv('Categorie;Item;Aantal\nKleding;Sokken;6'),
    [['Categorie', 'Item', 'Aantal'], ['Kleding', 'Sokken', '6']],
  );
});

test('herkent komma en tab', () => {
  assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']]);
  assert.deepEqual(parseCsv('a\tb\tc'), [['a', 'b', 'c']]);
});

test('een veld tussen aanhalingstekens mag het scheidingsteken bevatten', () => {
  assert.deepEqual(parseCsv('a,"Sokken, wollen",3'), [['a', 'Sokken, wollen', '3']]);
});

test('verdubbelde aanhalingstekens worden er één', () => {
  assert.deepEqual(parseCsv('a,"Zei ""hoi""",1'), [['a', 'Zei "hoi"', '1']]);
});

test('een regeleinde binnen een veld breekt de rij niet', () => {
  assert.deepEqual(parseCsv('a,"regel1\nregel2",1'), [['a', 'regel1\nregel2', '1']]);
});

test('CRLF en een BOM van Excel worden opgeruimd', () => {
  assert.deepEqual(parseCsv('a;b\r\nc;d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('﻿a;b'), [['a', 'b']]);
});

test('lege regels vallen weg, lege cellen blijven staan', () => {
  assert.deepEqual(parseCsv('a;b\n\n\nc;d\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('a;;c'), [['a', '', 'c']]);
});

test('de scheiding wordt bepaald buiten aanhalingstekens om', () => {
  // Eén puntkomma-veld bevat drie komma's; toch is de puntkomma de scheiding
  assert.deepEqual(parseCsv('a;"b,c,d,e";f'), [['a', 'b,c,d,e', 'f']]);
});

test('randgevallen leveren geen rommel op', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv(null), []);
  assert.deepEqual(parseCsv('Categorie;Item;Aantal'), [['Categorie', 'Item', 'Aantal']]);
  assert.deepEqual(parseCsv(' a ; b '), [['a', 'b']]);       // spaties eraf
  assert.deepEqual(parseCsv('a;b\nc;d'), [['a', 'b'], ['c', 'd']]); // geen slot-newline
});
