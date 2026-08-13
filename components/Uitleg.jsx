'use client';

// De handleiding, in de app zelf.
//
// Bewust géén schermafbeeldingen als bestand: die verouderen bij elke
// knopwijziging en kosten megabytes in de repo. De voorbeelden hieronder zijn
// nágebouwd met dezelfde kleuren en maten als het echte scherm, dus ze blijven
// vanzelf kloppen zolang het palet klopt. En omdat je toch al ín de app zit,
// staat bij elk punt een knop naar het echte scherm — dat zegt meer dan een
// plaatje.
//
// Alleen lezen: er staat geen enkele fetch of opslagcode in dit bestand.

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Check, Pencil, MapPin, X, ChevronUp, ChevronDown,
  Route as RouteIcon, RefreshCw, Car, Footprints, Play, Flag, Star, Plus,
  Camera, Wallet, Share2, ShieldCheck, WifiOff, ArrowUpCircle, Compass,
  Crosshair, Backpack, CheckSquare, Calendar as CalendarIcon, Map as MapIcon,
  Sparkles, Download, Trash2, Globe, History, Filter, ListChecks,
} from 'lucide-react';
import { COLORS, CATEGORIES } from '@/lib/data';

// ── Bouwstenen voor de nagebouwde voorbeelden ───────────────────────

const Scherm = ({ children, bijschrift }) => (
  <figure style={S.scherm}>
    <div style={S.schermBinnen}>{children}</div>
    {bijschrift && <figcaption style={S.bijschrift}>{bijschrift}</figcaption>}
  </figure>
);

// Een activiteit zoals hij op een dag staat, met alle knopjes erop.
const MockChip = ({ emoji, naam, notitie, kleur, rol, bezocht }) => (
  <div style={{ ...S.chip, borderLeft: `3px solid ${kleur}` }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, color: COLORS.inkLight }}>
      <ChevronUp size={13} /><ChevronDown size={13} />
    </div>
    <span style={{ fontSize: 16 }}>{emoji}</span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={S.chipNaam}>
        {rol === 'start' && <Play size={9} fill={COLORS.lake} color={COLORS.lake} />}
        {rol === 'eind' && <Flag size={10} color={COLORS.lake} />}
        {naam}
      </span>
      {notitie && <span style={S.chipNotitie}>{notitie}</span>}
    </span>
    <Check size={14} color={bezocht ? COLORS.moss : COLORS.inkLight} />
    <Pencil size={12} color={kleur} />
    <MapPin size={14} color={kleur} />
    <X size={14} color={COLORS.inkLight} />
    <Pencil size={13} color={COLORS.inkLight} />
  </div>
);

// Een klein, getekend kaartje: geen echte kaart, maar wel het idee ervan.
const MockKaart = ({ gestippeld, punten = [[26, 62], [52, 34], [78, 52], [104, 26]], hoogte = 96 }) => {
  const pad = punten.map(p => p.join(',')).join(' ');
  return (
    <svg viewBox={`0 0 130 ${hoogte}`} style={S.mockKaart} role="img" aria-label="Voorbeeldkaart">
      <rect x="0" y="0" width="130" height={hoogte} fill="#E9E2CC" />
      <path d="M0 70 Q 40 58 70 74 T 130 66" stroke="#D6CDB2" strokeWidth="7" fill="none" />
      <path d="M18 0 Q 26 40 14 96" stroke="#D6CDB2" strokeWidth="5" fill="none" />
      <circle cx="100" cy="80" r="16" fill="#CFE0DC" />
      <polyline
        points={pad}
        fill="none"
        stroke={COLORS.forest}
        strokeWidth="2.5"
        strokeDasharray={gestippeld ? '5 5' : undefined}
        opacity="0.8"
      />
      {punten.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill={COLORS.forest} stroke={COLORS.creamSoft} strokeWidth="2" />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={COLORS.creamSoft}>
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
};

const MockKnop = ({ icon, children, stijl }) => (
  <span style={{ ...S.mockKnop, ...stijl }}>{icon}{children}</span>
);

const Bekijk = ({ href, children }) => (
  <Link href={href} style={S.bekijk}>
    {children} <ArrowRight size={13} />
  </Link>
);

// ── Eén punt in de uitleg ───────────────────────────────────────────

const Punt = ({ nr, titel, children }) => (
  <section id={`p${nr}`} style={S.punt}>
    <h2 style={S.puntKop}>
      <span style={S.puntNr}>{nr}</span>
      {titel}
    </h2>
    {children}
  </section>
);

const PUNTEN = [
  'Waar dit voor is',
  'Binnenkomen: de PIN en je naam',
  'De reis instellen',
  'Het planscherm',
  'De volgorde van een dag',
  'Activiteiten vinden',
  'De kaart',
  'Het dagoverzicht',
  'De inpaklijst',
  'Auto & documenten',
  'Verblijven bijhouden',
  'De terugblik',
  'Uitgaven',
  'De meekijklink',
  'Beheer: kopieën en opruimen',
  'Samen plannen zonder elkaar te overschrijven',
  'Wat er achter de schermen nodig is',
];

export default function Uitleg() {
  return (
    <div style={S.pagina}>
      <div style={S.inner}>
        <Link href="/" style={S.terug}><ArrowLeft size={16} /> Planner</Link>

        <p style={S.kicker}>Handleiding</p>
        <h1 style={S.titel}>Zo werkt de vakantieplanner</h1>
        <p style={S.intro}>
          Alles wat de app kan, in zeventien punten. De voorbeelden hieronder zijn
          nagebouwd — tik op <strong>Bekijk het zelf</strong> om het echte scherm te
          openen.
        </p>

        <nav style={S.inhoud} aria-label="Inhoudsopgave">
          {PUNTEN.map((t, i) => (
            <a key={t} href={`#p${i + 1}`} style={S.inhoudLink}>
              <span style={S.inhoudNr}>{i + 1}</span> {t}
            </a>
          ))}
        </nav>

        {/* ── 1 ─────────────────────────────────────────────────── */}
        <Punt nr={1} titel={PUNTEN[0]}>
          <p style={S.p}>
            Eén gedeelde planning voor het hele gezin. Iedereen die de app opent ziet
            hetzelfde: dezelfde dagen, dezelfde activiteiten, dezelfde inpaklijst.
            Wat jij aanpast staat een paar tellen later ook op de telefoon van de rest.
          </p>
          <p style={S.p}>
            De app is gemaakt voor de <strong>telefoon</strong>, en voor plekken met
            matig bereik. Onderweg zonder verbinding zie je de laatst geladen versie,
            met een balkje erboven dat zegt hoe oud die is.
          </p>
        </Punt>

        {/* ── 2 ─────────────────────────────────────────────────── */}
        <Punt nr={2} titel={PUNTEN[1]}>
          <p style={S.p}>
            Bij het eerste bezoek vraagt de app om de <strong>familie-PIN</strong>. Die
            vul je één keer per apparaat in; daarna onthoudt je telefoon hem. Vul ook je
            <strong> naam</strong> in (rechtsboven op het planscherm): die verschijnt bij
            “Laatst bijgewerkt”, zodat je ziet wie er iets heeft veranderd.
          </p>
          <p style={S.p}>
            Zet de app op je beginscherm — in Safari via “Deel → Zet op beginscherm”, in
            Chrome via “Toevoegen aan startscherm”. Hij opent dan zonder adresbalk, als
            een echte app.
          </p>
        </Punt>

        {/* ── 3 ─────────────────────────────────────────────────── */}
        <Punt nr={3} titel={PUNTEN[2]}>
          <p style={S.p}>
            Alles begint met de reis: een <strong>titel</strong>, een{' '}
            <strong>periode</strong> en je <strong>verblijven</strong> (camping, hotel,
            huisje) met hun eigen datums. Uit die gegevens rolt de dagenlijst er vanzelf
            uit — je hoeft geen dagen aan te maken.
          </p>
          <p style={S.p}>
            Valt een dag in twee verblijven, dan heet hij <em>Wisseldag</em> en telt hij
            bij allebei. De eerste dag heet Aankomstdag, de laatste Vertrek.
          </p>
          <Scherm bijschrift="Zo staat een dag in de planning">
            <div style={S.dagKop}>
              <span style={S.dagDag}>MA</span>
              <span style={S.dagDatum}>10 aug</span>
              <span style={S.dagBadge}>CAMPING ELZAS</span>
            </div>
          </Scherm>
          <p style={S.hint}>
            Je vindt dit onder het tandwiel rechtsonder op het planscherm, of op de
            beheerpagina.
          </p>
        </Punt>

        {/* ── 4 ─────────────────────────────────────────────────── */}
        <Punt nr={4} titel={PUNTEN[3]}>
          <p style={S.p}>
            Het planscherm heeft twee tabbladen: <strong>Planning</strong> (de dagen) en{' '}
            <strong>Activiteiten</strong> (de hele voorraad ideeën). Op een dag tik je
            “Activiteit toevoegen” en kies je er een uit.
          </p>
          <Scherm bijschrift="Elke activiteit heeft dezelfde knoppen">
            <MockChip
              emoji="🅿️" naam="Parkeergarage" kleur={CATEGORIES.custom.color} rol="start"
            />
            <MockChip
              emoji="🛒" naam="Markthal" notitie="dinsdag en vrijdag"
              kleur={CATEGORIES.food.color} bezocht
            />
          </Scherm>
          <ul style={S.lijst}>
            <li><ChevronUp size={12} /><ChevronDown size={12} /> <b>Pijltjes</b> — schuif de activiteit omhoog of omlaag binnen de dag.</li>
            <li><Check size={12} /> <b>Vinkje</b> — “hier zijn we geweest”. Dat komt later terug bij het verblijf en in de terugblik.</li>
            <li><Pencil size={12} /> <b>Potlood links</b> — locatie toevoegen of wijzigen.</li>
            <li><MapPin size={12} /> <b>Speld</b> — opent de plek in Google Maps.</li>
            <li><X size={12} /> <b>Kruisje</b> — haalt hem van deze dag af (de activiteit zelf blijft bestaan).</li>
            <li><Pencil size={12} /> <b>Potlood rechts</b> — klapt open: naam, notitie, ster, rol in de route, en verplaatsen naar een andere dag.</li>
          </ul>
          <ul style={{ ...S.lijst, marginTop: 14 }}>
            <li>
              <MockKnop icon={<CalendarIcon size={11} />} stijl={S.knopGrijs}>Dagoverzicht</MockKnop>{' '}
              op elke dagkaart springt naar het dagoverzicht van pr&eacute;cies die dag —
              en daar brengt <b>In de planning</b> je weer terug naar dezelfde dag. De
              datum staat in het webadres, dus de terugknop van je telefoon werkt ook.
            </li>
            <li>
              <History size={12} /> <b>Afgelopen dagen staan ingeklapt.</b> Op dag tien
              wil je niet eerst langs negen voorbije dagen scrollen. Bovenaan staat
              “3 afgelopen dagen tonen” als je ze toch nodig hebt. Is de hele reis
              voorbij, dan blijft alles gewoon staan.
            </li>
          </ul>
          <p style={S.let}>
            Let op: naam, notitie en ster horen bij de <em>activiteit</em>, niet bij de dag.
            Staat dezelfde activiteit op twee dagen, dan verandert hij op allebei.
          </p>
          <Bekijk href="/">Bekijk het planscherm</Bekijk>
        </Punt>

        {/* ── 5 ─────────────────────────────────────────────────── */}
        <Punt nr={5} titel={PUNTEN[4]}>
          <p style={S.p}>
            Met de pijltjes schuif je zelf, maar met vijf stops is dat puzzelen. Tik dan{' '}
            <MockKnop icon={<RouteIcon size={11} />} stijl={S.knopLake}>Slimme volgorde</MockKnop>{' '}
            en de app zet ze in de kortste route.
          </p>
          <Scherm bijschrift="Van kriskras naar een logische ronde">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <MockKaart punten={[[20, 30], [95, 70], [45, 76], [110, 26]]} gestippeld />
              <ArrowRight size={16} color={COLORS.inkLight} />
              <MockKaart punten={[[20, 30], [45, 76], [95, 70], [110, 26]]} />
            </div>
            <div style={S.melding}>
              Volgorde aangepast · 12 km → 7,4 km rijden
            </div>
          </Scherm>
          <ul style={S.lijst}>
            <li>
              <b>Te voet of met de auto.</b> Liggen de stops binnen twee kilometer van
              elkaar, dan is het een stadsdag: de app rekent met wandelroutes en laat de
              rit vanaf de camping buiten beschouwing. Klopt de gok niet, dan staat er
              “Liever met de auto?” bij de melding — die keuze onthoudt hij voor die dag.
            </li>
            <li>
              <b>Start- en eindpunt.</b> Klap een activiteit open en kies bij <em>Rol in de
              route</em> voor Start of Eind. Handig bij een stadsbezoek: parkeren waar je
              begint <Play size={9} fill={COLORS.lake} color={COLORS.lake} />, eten waar je
              eindigt <Flag size={10} color={COLORS.lake} />. Zo’n keuze wordt altijd
              uitgevoerd, ook als de route er langer van wordt.
            </li>
            <li>
              <b>Ongedaan maken</b> staat naast de melding, dus je kunt het gerust proberen.
            </li>
            <li>
              <b>Wissel dag</b> ruilt alle activiteiten van twee dagen om — handig als het
              weer omslaat.
            </li>
          </ul>
        </Punt>

        {/* ── 6 ─────────────────────────────────────────────────── */}
        <Punt nr={6} titel={PUNTEN[5]}>
          <p style={S.p}>Er zijn vijf manieren om aan activiteiten te komen:</p>
          <ul style={S.lijst}>
            <li><b>De bibliotheek</b> — een voorraad standaardactiviteiten (zwemmen, markt, uit eten) per categorie.</li>
            <li><b>Zelf aanmaken</b> — naam, emoji, categorie en een locatie.</li>
            <li>
              <b>Een Google Maps-link plakken.</b> Deel een plek vanuit de Maps-app en plak
              hem in het locatieveld; de app haalt er de naam en de coördinaten uit. De
              rommel eromheen (“Camping X · Route · https://…”) mag blijven staan.
            </li>
            <li>
              <MockKnop icon={<Compass size={11} />} stijl={S.knopLake}>Ontdek de omgeving</MockKnop>{' '}
              — zoekt bezienswaardigheden, dorpen en wandelroutes rond een verblijf. Een
              wandelroute komt mét de lijn mee, en die kun je later als <b>GPX</b> downloaden.
            </li>
            <li>
              <MockKnop icon={<Crosshair size={11} />} stijl={S.knopLake}>In de buurt</MockKnop>{' '}
              — hetzelfde, maar rond de plek waar je nú staat. Onderweg dus.
            </li>
          </ul>
          <p style={{ ...S.p, marginTop: 14 }}>
            Met meerdere verblijven wordt die lijst al snel een stapel met alles door
            elkaar. Daarom staat er bovenaan een balkje:
          </p>
          <Scherm bijschrift="Standaard alleen wat in de buurt ligt">
            <div style={S.filterVoorbeeld}>
              <Filter size={13} style={{ color: COLORS.lake, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>In de buurt van <strong>Camping Elzas</strong></span>
              <span style={S.filterVoorbeeldLink}>Alles tonen (23)</span>
            </div>
          </Scherm>
          <p style={S.p}>
            De app kijkt welk verblijf vandaag aan de beurt is en toont alleen de
            activiteiten die daar het dichtst bij liggen. Wil je vooruit plannen voor het
            volgende verblijf, of achteraf nog iets bij het vorige zetten, dan haalt
            <strong> Alles tonen</strong> de rest erbij. Activiteiten <em>zonder</em>{' '}
            locatie blijven altijd staan — die horen nergens specifiek bij.
          </p>
          <Bekijk href="/">Naar de activiteiten</Bekijk>
        </Punt>

        {/* ── 7 ─────────────────────────────────────────────────── */}
        <Punt nr={7} titel={PUNTEN[6]}>
          <p style={S.p}>
            Alle geplande activiteiten op één kaart, gekleurd per categorie. Kies een dag
            om alleen die dag te zien. Tik op een lege plek en de app zoekt op wat daar in
            de buurt is, zodat je het meteen kunt toevoegen.
          </p>
          <Scherm bijschrift="Elke stop een speld, de route ertussen">
            <MockKaart />
          </Scherm>
          <Bekijk href="/kaart">Open de kaart</Bekijk>
        </Punt>

        {/* ── 8 ─────────────────────────────────────────────────── */}
        <Punt nr={8} titel={PUNTEN[7]}>
          <p style={S.p}>
            Dit is het scherm voor <em>vandaag</em>: één dag tegelijk, met de stops
            genummerd in de geplande volgorde, de route ertussen en de weersverwachting.
          </p>
          <ul style={S.lijst}>
            <li><Footprints size={12} /> <b>Te voet of met de auto</b> — dezelfde regel als bij de slimme volgorde, met afstand en tijd per etappe.</li>
            <li><b>Volledig scherm</b> — het knopje rechtsboven op de kaart; Escape sluit weer.</li>
            <li>
              <MockKnop icon={<ListChecks size={11} />} stijl={S.knopGrijs}>In de planning</MockKnop>{' '}
              springt terug naar het planscherm, naar dezelfde dag — die licht daar
              even op zodat je meteen ziet waar je bent.
            </li>
            <li><Check size={12} /> <b>Aanvinken onderweg</b> — wat je gedaan hebt vink je hier af.</li>
            <li><Download size={12} /> <b>GPX</b> — een wandelroute meenemen naar je horloge of losse navigatie.</li>
          </ul>
          <Bekijk href="/dag">Open het dagoverzicht</Bekijk>
        </Punt>

        {/* ── 9 ─────────────────────────────────────────────────── */}
        <Punt nr={9} titel={PUNTEN[8]}>
          <p style={S.p}>
            Eén lijst voor het hele gezin, ingedeeld in categorieën. Per regel staat er
            hoeveel er mee moeten en hoeveel er al ingepakt zijn.
          </p>
          <Scherm bijschrift="Aantallen, personen en een vinkje">
            <div style={S.pakRegel}>
              <span style={S.pakVink}><Check size={12} color={COLORS.creamSoft} /></span>
              <span style={{ flex: 1 }}>
                <span style={S.pakNaam}>Regenjas</span>
                <span style={S.pakMeta}>Sanne · 2 van 2 ingepakt</span>
              </span>
              <span style={S.pakTeller}>2</span>
            </div>
            <div style={{ ...S.pakRegel, opacity: 0.55 }}>
              <span style={{ ...S.pakVink, background: 'transparent', border: `1.5px solid ${COLORS.hairline}` }} />
              <span style={{ flex: 1 }}>
                <span style={{ ...S.pakNaam, textDecoration: 'line-through' }}>Slaapzak</span>
                <span style={S.pakMeta}>· niet mee</span>
              </span>
              <span style={S.pakTeller}>0</span>
            </div>
          </Scherm>
          <ul style={S.lijst}>
            <li><b>Aantal 0</b> betekent “dit jaar niet mee”: de regel blijft staan, doorgestreept, voor volgend jaar.</li>
            <li><b>Per persoon</b> — je kunt een regel aan iemand koppelen en daarop filteren.</li>
            <li><b>Importeren</b> — een bestaande lijst als CSV inlezen.</li>
          </ul>
          <Bekijk href="/inpakken">Open de inpaklijst</Bekijk>
        </Punt>

        {/* ── 10 ────────────────────────────────────────────────── */}
        <Punt nr={10} titel={PUNTEN[9]}>
          <p style={S.p}>
            Een aparte lijst voor het saaie maar belangrijke werk: bandenspanning,
            olie, groene kaart, paspoorten, verzekeringspapieren. Vinkjes blijven staan,
            ook als je een nieuwe vakantie begint — die zet je zelf terug.
          </p>
          <Bekijk href="/checklist">Open de checklist</Bekijk>
        </Punt>

        {/* ── 11 ────────────────────────────────────────────────── */}
        <Punt nr={11} titel={PUNTEN[10]}>
          <p style={S.p}>
            Het logboek van alle plekken waar jullie hebben geslapen — deze vakantie én
            die van vroeger. Per verblijf een <strong>cijfer</strong>, een{' '}
            <strong>review</strong>, <strong>foto’s</strong> en de website.
          </p>
          <p style={S.p}>
            De verblijven staan <strong>gebundeld per vakantie</strong>: wie in één reis
            drie campings deed, ziet die drie bij elkaar onder één kop.
          </p>
          <Scherm bijschrift="Een reis met zijn verblijven eronder">
            <div style={S.reisKop}>
              <span style={{ ...S.reisStreep, background: COLORS.lake }} />
              <span style={{ flex: 1 }}>
                <span style={S.reisNaam}>Noorwegen 2019 <Pencil size={11} style={{ opacity: 0.5 }} /></span>
                <span style={S.verblijfMeta}>5 jul — 20 jul 2019 · 2 verblijven · gem. 7,5</span>
              </span>
            </div>
            <div style={S.verblijf}>
              <span style={S.cijfer}>8</span>
              <span style={{ flex: 1 }}>
                <span style={S.verblijfNaam}>Camping Oslo</span>
                <span style={S.verblijfMeta}>🇳🇴 Noorwegen · Camping — tent · 5 jul — 12 jul 2019</span>
              </span>
              <span style={S.verblijfTeller}><Camera size={11} /> 4</span>
              <span style={{ ...S.verblijfTeller, color: COLORS.moss }}><Footprints size={11} /> 6</span>
            </div>
          </Scherm>
          <p style={S.p}>
            De naam van een reis wordt afgeleid uit de datums (“jul 2019”), maar met het{' '}
            <Pencil size={11} style={{ verticalAlign: 'middle' }} />-tje geef je hem een
            eigen naam. Leegmaken brengt de afgeleide naam terug.
          </p>
          <p style={S.let}>
            Handig om te weten: geef je twee vakanties die vlak na elkaar vielen
            verschillende namen, dan trekt de app ze ook echt uit elkaar. Zo splits je
            twee reizen die per ongeluk aan elkaar geplakt waren.
          </p>
          <ul style={S.lijst}>
            <li><b>Land en soort</b> — het land wordt automatisch uit de locatie afgeleid; het soort kies je zelf (tent, caravan, hotel, bnb…).</li>
            <li><b>Reizen</b> — verblijven die in de tijd aan elkaar grenzen worden als één reis getoond, met de route ertussen op de kaart.</li>
            <li><b>Zoeken</b> — filter op land, jaar, soort, reis of minimumcijfer.</li>
            <li><Footprints size={12} /> <b>Bezocht in de buurt</b> — wat je die vakantie hebt aangevinkt komt hier te staan. Bij een camping van vóór deze app is er geen planning: dan zet je ze er met “Zelf toevoegen” zelf bij.</li>
          </ul>
          <Bekijk href="/verblijven">Open het logboek</Bekijk>
        </Punt>

        {/* ── 12 ────────────────────────────────────────────────── */}
        <Punt nr={12} titel={PUNTEN[11]}>
          <p style={S.p}>
            De cijfers uit het logboek bij elkaar: hoeveel nachten, in welke landen, per
            jaar, en welk verblijf het hoogste cijfer kreeg. Een verblijf zonder cijfer
            telt wel mee als verblijf, maar niet in het gemiddelde.
          </p>
          <p style={S.p}>
            De balk per jaar is <strong>opgedeeld per reis</strong>, in tinten groen: een
            jaar met 27 nachten waren misschien twee losse vakanties, en dat hoor je te
            kunnen zien. De namen staan eronder in dezelfde volgorde.
          </p>
          <Scherm bijschrift="2019: twee vakanties in één balk">
            <div style={S.jaarRij}>
              <span style={S.jaarLabel}>2019</span>
              <span style={S.jaarSpoor}>
                <span style={{ display: 'flex', height: '100%', width: '86%', borderRadius: 99, overflow: 'hidden' }}>
                  <span style={{ flex: 15, background: COLORS.forest }} />
                  <span style={{ flex: 4, background: '#6E9A72', borderLeft: `1px solid ${COLORS.creamSoft}` }} />
                </span>
              </span>
              <span style={S.jaarGetal}>19&thinsp;n</span>
            </div>
            <div style={S.jaarLegenda}>
              <span style={S.jaarLegendaItem}>
                <span style={{ ...S.jaarStip, background: COLORS.forest }} /> Noorwegen 2019 15&thinsp;n
              </span>
              <span style={S.jaarLegendaItem}>
                <span style={{ ...S.jaarStip, background: '#6E9A72' }} /> sep 2019 4&thinsp;n
              </span>
            </div>
          </Scherm>
          <Bekijk href="/verslag">Open de terugblik</Bekijk>
        </Punt>

        {/* ── 13 ────────────────────────────────────────────────── */}
        <Punt nr={13} titel={PUNTEN[12]}>
          <p style={S.p}>
            Een kasboek voor de reis: wat is er uitgegeven, waaraan, en door wie.
          </p>
          <Scherm bijschrift="Een uitgave met categorie en betaler">
            <div style={S.uitgave}>
              <span style={S.uitgaveDatum}>10 aug</span>
              <span style={{ flex: 1 }}>
                <span style={S.pakNaam}>Boodschappen Super U</span>
                <span style={S.pakMeta}>🛒 Boodschappen · betaald door Harm</span>
              </span>
              <span style={S.bedrag}>€ 47,80</span>
            </div>
          </Scherm>
          <ul style={S.lijst}>
            <li><b>Per categorie en per persoon</b> — je ziet meteen waar het geld heen gaat en wie wat heeft voorgeschoten.</li>
            <li><b>Eerlijk delen</b> — bij het verdelen gaat de laatste cent naar de eerste persoon in plaats van te verdampen; de som klopt altijd precies.</li>
          </ul>
          <Bekijk href="/uitgaven">Open het kasboek</Bekijk>
        </Punt>

        {/* ── 14 ────────────────────────────────────────────────── */}
        <Punt nr={14} titel={PUNTEN[13]}>
          <p style={S.p}>
            Wil je opa en oma laten meekijken zonder ze de PIN te geven? Maak op de
            beheerpagina een <strong>meekijklink</strong> aan. Die opent een kale,
            alleen-lezen pagina: de reis, de dagen en de activiteiten.
          </p>
          <ul style={S.lijst}>
            <li><b>Per dag de route</b> — de bezoeker tikt op een dag en ziet de stops genummerd op een kaartje, met de route en de afstanden ertussen.</li>
            <li><b>Wat er niet in zit</b> — namen van het gezin, het verblijvenlogboek, foto’s, uitgaven, en activiteiten die op geen enkele dag staan.</li>
            <li><b>Intrekken kan altijd</b> — daarna werkt de oude link niet meer, ook niet bij wie hem al had.</li>
          </ul>
          <Bekijk href="/beheer">Beheer de deel-link</Bekijk>
        </Punt>

        {/* ── 15 ────────────────────────────────────────────────── */}
        <Punt nr={15} titel={PUNTEN[14]}>
          <p style={S.p}>
            De beheerpagina zit achter een <strong>eigen wachtwoord</strong>, bovenop de
            PIN. Daar staat het gereedschap dat je zelden nodig hebt maar dan wel meteen:
          </p>
          <ul style={S.lijst}>
            <li><ShieldCheck size={12} /> <b>Reservekopieën</b> — elke nacht automatisch, en je kunt er zelf een maken. Terugzetten kan ook; vlak daarvóór maakt de app nog een veiligheidskopie van de huidige stand. Blijft de nachtelijke kopie uit, dan staat er een oranje waarschuwing boven de lijst — een stille reservekopie is erger dan geen.</li>
            <li><Download size={12} /> <b>Alles downloaden</b> — één JSON-bestand met de hele planning.</li>
            <li><b>Foutenlogboek</b> — als er iets misgaat wordt dat hier stilletjes genoteerd. Handig als je wilt melden dat iets niet werkt.</li>
            <li><Trash2 size={12} /> <b>Opruimen</b> — planning wissen of een nieuwe vakantie starten. De verblijven kun je daarbij eerst in het logboek bewaren.</li>
          </ul>
          <Bekijk href="/beheer">Open beheer</Bekijk>
        </Punt>

        {/* ── 16 ────────────────────────────────────────────────── */}
        <Punt nr={16} titel={PUNTEN[15]}>
          <p style={S.p}>
            Vier dingen zorgen dat jullie elkaar niet in de weg zitten:
          </p>
          <ul style={S.lijst}>
            <li><b>Automatisch opslaan</b> — je hoeft nergens op “bewaren” te tikken; een halve seconde nadat je stopt met tikken staat het erop.</li>
            <li><b>Bijwerken bij terugkomst</b> — kom je terug in de app, dan haalt hij vanzelf de nieuwste versie op.</li>
            <li>
              <b>Botsingen worden een vraag, geen ramp.</b> Heeft iemand anders intussen
              iets opgeslagen, dan krijg je de keuze: hun versie laden of toch de jouwe
              bewaren. De app kiest nooit stiekem voor je.
            </li>
            <li><WifiOff size={12} /> <b>Geen bereik</b> — je ziet de laatst geladen versie met een balkje erboven, en opslaan staat uit zodat je niets van een ander overschrijft.</li>
            <li><ArrowUpCircle size={12} /> <b>Nieuwe versie</b> — is de app bijgewerkt terwijl jij hem openhad, dan verschijnt onderin een balkje met een herlaadknop.</li>
          </ul>
          <Scherm bijschrift="Zo ziet een botsing eruit">
            <div style={S.botsing}>
              <RefreshCw size={13} />
              <span style={{ flex: 1 }}>Sanne heeft intussen iets opgeslagen.</span>
              <span style={S.botsingKnop}>Hun versie</span>
              <span style={S.botsingKnop}>Toch de mijne</span>
            </div>
          </Scherm>
        </Punt>

        {/* ── 17 ────────────────────────────────────────────────── */}
        <Punt nr={17} titel={PUNTEN[16]}>
          <p style={S.p}>
            Het meeste werkt zonder instellingen. Een paar dingen hebben een sleutel
            nodig, die de beheerder in Vercel zet:
          </p>
          <ul style={S.lijst}>
            <li><b>Familie-PIN en beheerwachtwoord</b> — zonder die twee staat alles open.</li>
            <li><b>OpenRouteService</b> — nauwkeuriger routes, en het is de sleutel die wandelroutes mogelijk maakt. Zonder sleutel rekent de app hemelsbreed en zegt dat erbij.</li>
            <li><b>Fotoopslag</b> — nodig voor foto’s bij verblijven en voor de nachtelijke reservekopie.</li>
          </ul>
          <p style={S.hint}>
            De volledige instructies staan in het README-bestand van het project.
          </p>
        </Punt>

        <p style={S.voet}>
          Iets onduidelijk of werkt er iets niet zoals hier beschreven? Meld het via de
          beheerpagina — dan komt het in het foutenlogboek terecht.
        </p>
      </div>
    </div>
  );
}

// ── Stijl ───────────────────────────────────────────────────────────

const S = {
  pagina: {
    fontFamily: "'DM Sans', sans-serif",
    background: COLORS.cream, color: COLORS.charcoal, minHeight: '100vh',
  },
  inner: { maxWidth: 720, margin: '0 auto', padding: '18px 20px 60px' },
  terug: {
    color: COLORS.forest, fontSize: 14, textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  kicker: {
    fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600, margin: '18px 0 4px',
  },
  titel: {
    fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 8px', letterSpacing: '-0.02em',
  },
  intro: { fontSize: 14, color: COLORS.ink, lineHeight: 1.65, margin: '0 0 18px' },

  inhoud: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 2, background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: 10, marginBottom: 26,
  },
  inhoudLink: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px',
    fontSize: 13, color: COLORS.forest, textDecoration: 'none', borderRadius: 8,
  },
  inhoudNr: {
    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
    background: 'rgba(58,126,132,0.12)', color: COLORS.lake,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700,
  },

  punt: { marginBottom: 30, scrollMarginTop: 16 },
  puntKop: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 10px', letterSpacing: '-0.01em',
  },
  puntNr: {
    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
    background: COLORS.forest, color: COLORS.cream,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
  },
  p: { fontSize: 14, color: COLORS.ink, lineHeight: 1.7, margin: '0 0 10px' },
  let: {
    fontSize: 13, color: COLORS.ink, lineHeight: 1.6, margin: '10px 0 0',
    padding: '9px 12px', borderRadius: 10,
    background: 'rgba(201,125,93,0.10)', borderLeft: `3px solid ${COLORS.sunset}`,
  },
  hint: { fontSize: 12.5, color: COLORS.inkLight, lineHeight: 1.6, margin: '8px 0 0' },
  lijst: {
    listStyle: 'none', margin: '10px 0 0', padding: 0,
    display: 'flex', flexDirection: 'column', gap: 9,
    fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6,
  },

  scherm: {
    margin: '12px 0 0', padding: 12, borderRadius: 14,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
  },
  schermBinnen: { display: 'flex', flexDirection: 'column', gap: 7 },
  bijschrift: {
    fontSize: 11.5, color: COLORS.inkLight, marginTop: 9, textAlign: 'center',
  },

  chip: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: COLORS.cream, borderRadius: 10, padding: '8px 9px 8px 5px',
    boxShadow: '0 1px 2px rgba(31,41,34,0.04)',
  },
  chipNaam: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 13.5, fontWeight: 500, color: COLORS.charcoal,
  },
  chipNotitie: { display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 1 },

  mockKaart: {
    width: '100%', maxWidth: 190, height: 'auto', borderRadius: 10,
    border: `1px solid ${COLORS.hairline}`, display: 'block',
  },
  mockKnop: {
    display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle',
    padding: '2px 9px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  knopLake: {
    background: 'rgba(58,126,132,0.10)', color: COLORS.lake,
    border: `1px solid ${COLORS.lake}66`,
  },
  knopGrijs: {
    background: 'transparent', color: COLORS.inkLight,
    border: `1px solid ${COLORS.hairline}`,
  },
  filterVoorbeeld: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 11px', borderRadius: 10,
    background: 'rgba(58,126,132,0.08)', fontSize: 12.5, color: COLORS.ink,
  },
  filterVoorbeeldLink: {
    color: COLORS.lake, fontWeight: 700, textDecoration: 'underline', flexShrink: 0,
  },
  reisKop: { display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 2 },
  reisStreep: { width: 4, alignSelf: 'stretch', minHeight: 30, borderRadius: 99, flexShrink: 0 },
  reisNaam: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'Fraunces', serif", fontSize: 17, color: COLORS.forest, fontWeight: 500,
  },
  jaarRij: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 },
  jaarLabel: { minWidth: 34, color: COLORS.ink },
  jaarSpoor: {
    flex: 1, height: 9, borderRadius: 99, background: 'rgba(31,41,34,0.08)', overflow: 'hidden',
  },
  jaarGetal: { minWidth: 30, textAlign: 'right', color: COLORS.inkLight },
  jaarLegenda: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', margin: '4px 0 0 43px', fontSize: 11 },
  jaarLegendaItem: { display: 'inline-flex', alignItems: 'center', gap: 5, color: COLORS.ink },
  jaarStip: { width: 8, height: 8, borderRadius: 3, display: 'inline-block' },
  melding: {
    marginTop: 4, padding: '7px 10px', borderRadius: 8,
    background: 'rgba(74,111,79,0.10)', color: COLORS.moss,
    fontSize: 11.5, fontWeight: 600,
  },

  dagKop: { display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' },
  dagDag: {
    fontFamily: "'Fraunces', serif", fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', color: COLORS.inkLight,
  },
  dagDatum: { fontFamily: "'Fraunces', serif", fontSize: 20, color: COLORS.forest },
  dagBadge: {
    fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600,
    padding: '2px 7px', borderRadius: 99,
    background: 'rgba(58,126,132,0.12)', color: COLORS.lake,
  },

  pakRegel: {
    display: 'flex', alignItems: 'center', gap: 9,
    background: COLORS.cream, borderRadius: 10, padding: '9px 11px',
  },
  pakVink: {
    width: 19, height: 19, borderRadius: 6, flexShrink: 0, background: COLORS.moss,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  pakNaam: { display: 'block', fontSize: 13.5, fontWeight: 500, color: COLORS.charcoal },
  pakMeta: { display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 1 },
  pakTeller: {
    fontSize: 12, fontWeight: 700, color: COLORS.ink,
    background: 'rgba(31,41,34,0.06)', borderRadius: 7, padding: '3px 8px',
  },

  verblijf: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: COLORS.cream, borderRadius: 11, padding: '10px 11px',
  },
  cijfer: {
    width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: COLORS.moss,
    color: COLORS.creamSoft, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 14,
  },
  verblijfNaam: { display: 'block', fontSize: 13.5, fontWeight: 600, color: COLORS.charcoal },
  verblijfMeta: { display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 2 },
  verblijfTeller: {
    display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
    fontSize: 11, color: COLORS.inkLight,
  },

  uitgave: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: COLORS.cream, borderRadius: 10, padding: '9px 11px',
  },
  uitgaveDatum: {
    fontSize: 11, color: COLORS.inkLight, flexShrink: 0, width: 44,
  },
  bedrag: {
    fontSize: 13.5, fontWeight: 700, color: COLORS.forest, flexShrink: 0,
  },

  botsing: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: '9px 11px', borderRadius: 10,
    background: 'rgba(201,125,93,0.12)', color: COLORS.sunset,
    fontSize: 12, fontWeight: 600,
  },
  botsingKnop: {
    padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
    background: COLORS.creamSoft, color: COLORS.forest,
  },

  bekijk: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
    padding: '8px 14px', borderRadius: 99,
    background: 'rgba(45,79,62,0.08)', color: COLORS.forest,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
  },
  voet: {
    fontSize: 12.5, color: COLORS.inkLight, lineHeight: 1.6,
    textAlign: 'center', marginTop: 30,
  },
};
