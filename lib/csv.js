// CSV inlezen zonder externe bibliotheek.
//
// Vervangt het vroegere `xlsx`, dat hier alleen werd gebruikt om een bestand
// om te zetten naar rijen met cellen. Dat pakket had kwetsbaarheden zonder
// beschikbare fix; deze paar regels doen voor dit doel hetzelfde.
//
// Bewust géén 'use client': pure logica, ook los te testen.

// Welke scheiding gebruikt dit bestand? Nederlands Excel exporteert met een
// puntkomma, Engelstalig met een komma, en wie uit Google Sheets plakt heeft
// tabs. We kijken naar de eerste regel buiten aanhalingstekens en nemen het
// teken dat daar het vaakst staat.
function bepaalScheiding(tekst) {
  let regelEinde = tekst.length;
  let inQuote = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && (c === '\n' || c === '\r')) { regelEinde = i; break; }
  }
  const eersteRegel = tekst.slice(0, regelEinde);

  let beste = ',';
  let hoogste = 0;
  for (const kandidaat of [';', ',', '\t']) {
    let aantal = 0;
    let q = false;
    for (const c of eersteRegel) {
      if (c === '"') q = !q;
      else if (!q && c === kandidaat) aantal++;
    }
    if (aantal > hoogste) { hoogste = aantal; beste = kandidaat; }
  }
  return beste;
}

// Zet CSV-tekst om naar een array van rijen, elke rij een array van cellen.
// Volgt de gebruikelijke regels: een veld tussen aanhalingstekens mag het
// scheidingsteken, regeleindes en — als "" — een aanhalingsteken bevatten.
export function parseCsv(tekst, scheiding) {
  if (typeof tekst !== 'string' || tekst === '') return [];

  // Excel zet er een byte-order-mark voor; die hoort niet in de eerste cel.
  let s = tekst.charCodeAt(0) === 0xfeff ? tekst.slice(1) : tekst;
  const sep = scheiding || bepaalScheiding(s);

  const rijen = [];
  let rij = [];
  let veld = '';
  let inQuote = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuote) {
      if (c === '"') {
        if (s[i + 1] === '"') { veld += '"'; i++; }  // "" → letterlijk "
        else inQuote = false;
      } else {
        veld += c;
      }
      continue;
    }

    if (c === '"') { inQuote = true; continue; }
    if (c === sep) { rij.push(veld); veld = ''; continue; }
    if (c === '\r') { if (s[i + 1] === '\n') i++; rijen.push([...rij, veld]); rij = []; veld = ''; continue; }
    if (c === '\n') { rijen.push([...rij, veld]); rij = []; veld = ''; continue; }
    veld += c;
  }

  // Laatste regel zonder afsluitend regeleinde
  if (veld !== '' || rij.length > 0) rijen.push([...rij, veld]);

  // Volledig lege regels weglaten — die leveren anders lege items op
  return rijen
    .map(r => r.map(cel => cel.trim()))
    .filter(r => r.some(cel => cel !== ''));
}
