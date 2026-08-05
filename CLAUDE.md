# CLAUDE.md — architectuur en valkuilen

Werkinstructies voor Claude Code in deze repo. De README is de *gebruikers*-handleiding
(deployen, env vars, Vercel); dit document is de *ontwikkelaars*-kant: hoe het in elkaar
zit en waar je je aan bezeert.

## Wat dit is

Gedeelde familie-vakantieplanner. Next.js 15 App Router, React 19, JavaScript (geen
TypeScript), inline style-objecten (geen CSS-framework, geen Tailwind), Upstash Redis als
enige opslag. Draait op Vercel. Alle UI-tekst is **Nederlands** — houd dat zo, inclusief
code-commentaar.

## Commando's

```bash
npm install
npm run dev          # http://localhost:3000
npx next build       # moet slagen vóór je pusht
```

Er zijn geen tests en geen linter-config. `npx next build` is de enige poort — draai die
na elke wijziging. De build slaagt zonder Redis-env-vars (je ziet dan alleen
`[Upstash Redis] Unable to find environment variable` tijdens page-data-collectie); de
API's falen dan pas op runtime.

## Structuur

```
app/
  page.jsx                → Planner        (hoofdscherm: plan + bibliotheek)
  kaart/page.jsx          → MapView        (alle activiteiten op de kaart)
  dag/page.jsx            → DayOverview    (dag-voor-dag, met autoroute + GPX)
  inpakken/page.jsx       → PackingList
  checklist/page.jsx      → Checklist
  layout.jsx, manifest.js, icon.svg, globals.css   (PWA + huisstijl)
  api/
    plan/       GET/PUT   hoofddocument (dagen, activiteiten, reisconfig)
    inpakken/   GET/POST  inpaklijst
    checklist/  GET/POST  auto- & documentenchecklist
    geocode/    GET       Nominatim-zoeken
    route/      POST      autoroute (ORS met key, anders publieke OSRM)
    suggest/    GET/POST  "Ontdek de omgeving" — bezienswaardigheden
    hiking/     POST      wandelroutes uit OSM-relaties
    resolve-maps/ POST    Google Maps-link → naam + coördinaten
    whats-here/ GET/POST  POI's rond een aangeklikt kaartpunt
components/   Planner.jsx (~4200 r.), MapView.jsx, DayOverview.jsx,
              PackingList.jsx, Checklist.jsx
lib/          data.js (palet, categorieën, buildDays, overrides), redis.js, useRoute.js
```

`components/Planner.jsx` is bewust één groot bestand: alle sheets (`PickDaySheet`,
`SuggestionsSheet`, `PasteLinkSheet`, `WhatsHereSheet`, `TripSettingsSheet`, …) staan
erin als lokale componenten. Splits het niet zonder reden — de state zit dicht op elkaar.

## Datamodel

Drie losse Redis-documenten, elk één JSON-blob:

| Key | Vorm |
| --- | --- |
| `planner:trip` | `{ plan, customActivities, locationOverrides, tripConfig, suggestExclusions, updatedAt, updatedBy }` |
| `planner:inpakken` | `{ categories:[{id,name}], items:[{id,categoryId,label,qty,checked,packed,important,note}], updatedBy, updatedAt }` |
| `planner:checklist` | `{ checked:{}, updatedBy, updatedAt }` |

Elk van de drie leest eenmalig een **legacy key** (`vosges:family-plan`,
`vogezen2026:*`) als de nieuwe leeg is. Niet weghalen — dat is de migratie van de oude
Vogezen-versie.

Kern van het hoofddocument:

- `plan` = `{ 'YYYY-MM-DD': [activityId, …] }` — **alleen id's, geen kopieën**.
- `customActivities` = eigen activiteiten (`custom_<timestamp>`), inclusief `coords`,
  `mapsQuery`, `note`, `important`, `routeGeometry`.
- `locationOverrides` = `{ activityId: {…} }`, het override-mechanisme voor de
  ingebouwde activiteiten uit `DEFAULT_ACTIVITIES` (`g_*`), die read-only zijn.
- `tripConfig` = titel, `startDate`, `endDate`, `stays[]`. `buildDays(tripConfig)` leidt
  hier de dagenlijst uit af (max 90 dagen, wisseldag = dag die in twee verblijven valt).

## Valkuilen

**1. Eigenschappen horen bij de activiteit, niet bij de dag.**
`plan` bevat id's, dus dezelfde activiteit op twee dagen deelt naam, notitie en
★-vlag. Dat is bewust (feature: wijziging werkt door in planner, kaart én dagoverzicht),
maar het betekent dat je een activiteit niet per dag anders kunt labelen. Wil je dat
toch, dan moet het datamodel van `plan` mee veranderen — dat raakt alle vier de
componenten. Zet nieuwe eigenschappen via `updateActivityProps()`: custom → direct in
`customActivities`, built-in → in `locationOverrides`.

**2. `undefined` ≠ `null` in overrides.**
`applyLocationOverride()` neemt een veld alleen over als het `!== undefined` is; `null`
betekent expliciet *wissen*. Schrijf dus nooit "opruimend" `null` waar je "niet
gewijzigd" bedoelt.

**3. `PUT /api/plan` bewaart velden die de client niet meestuurt.**
`tripConfig` en `suggestExclusions` worden uit de opgeslagen staat teruggehaald als ze
`undefined` zijn — precies omdat `MapView` ze niet allemaal meestuurt. **Voeg je een
nieuw top-level veld toe aan het document, dan moet je diezelfde bewaar-tak toevoegen**,
anders wist een save vanaf `/kaart` het veld stilletjes.

**4. Sync is last-write-wins met twee vangnetten.**
Opslaan is gedebounced (500 ms in `Planner`, vergelijkbaar in `PackingList`), en elke
pagina herlaadt bij `window.focus`. Twee refs voorkomen dat die twee elkaar slopen:
`skipNextSave` (na een fetch niet meteen terugschrijven) en `dirty` (focus-refresh
overslaat zolang lokale wijzigingen nog niet opgeslagen zijn — vuurt o.a. na een
confirm-popup). Haal ze niet weg; zonder die refs verlies je de laatste bewerking.
Echte conflictafhandeling bestaat niet: twee mensen tegelijk = de laatste wint.

**5. Leaflet is browser-only.**
Overal hetzelfde patroon: `await import('leaflet')` in een effect, plus de CSS die als
`<link data-leaflet>` van unpkg wordt geprikt (dus geen import in globals.css). Nooit op
moduleniveau importeren — dat breekt de build/SSR. Kaartinstanties opruimen in de
cleanup, anders krijg je "Map container is already initialized".

**6. Coördinaten: intern `[lat, lng]`, GeoJSON `[lng, lat]`.**
De hele app werkt met `[lat, lng]`. ORS/OSRM en GeoJSON leveren `[lng, lat]` — de
omdraaiing gebeurt in `api/route/route.js` en bij het tekenen in `MapView`/`DayOverview`.
Bij nieuwe code die geometrie aanraakt: controleer welke kant je in zit.

**7. Overpass is de zwakke schakel.**
`hiking/` en `whats-here/` leunen op publieke Overpass-servers, die Vercel-IP's soms
weigeren of traag beantwoorden. Opgevangen met 6 endpoints in willekeurige volgorde,
13 s timeouts en een tweefasige aanpak in `hiking/`: fase 1 haalt tags + zwaartepunt
(`out tags center`), fase 2 pas de geometrie (`out geom`) van de gekozen relaties. Houd
die tweedeling in stand — de zware query in één keer valt structureel om. Voor
bezienswaardigheden is **Geoapify** (`GEOAPIFY_API_KEY`) het primaire pad en Overpass de
reserve; voor wandelroute-relaties bestaat geen alternatief.

**8. `routeGeometry` staat alleen op nieuw toegevoegde wandelroutes.**
Bij toevoegen wordt de lijn vereenvoudigd tot ≤200 punten (5 decimalen) en op de
activiteit bewaard, want alles gaat in één Redis-blob. Gevolg: routes van vóór deze
functie tonen in `/dag` alleen hun startpunt en hebben geen GPX-knop (opnieuw toevoegen
lost dat op), en de GPX uit `/dag` is de vereenvoudigde versie — die uit de
zoekresultaten is de volledige. `/kaart` tekent wandelroute-geometrie **niet**; dat botst
met de bestaande dagroute-fit-logica daar en is bewust open gelaten.

**9. Inpaklijst-invarianten.**
`checked ⟺ packed >= qty`. Vinkje aan zet `packed = qty`, deelteller vol zet `checked`,
en `qty` wijzigen clampt `packed` mee. `qty === 0` is géén afgevinkt item maar "dit jaar
niet mee": doorgestreept met "· niet mee", vinkje zet de gebruiker zelf. Raak je één van
de drie velden aan, houd dan alle drie de paden kloppend (`toggle`, `setPacked`,
`changeQty`).

**10. Auth is optioneel en zit in een header.**
Staat `FAMILY_PIN` niet ingesteld, dan is alles open. Staat hij wel, dan verwacht elke
route `X-Family-Pin` (de client haalt hem uit `localStorage['planner-pin']`). Nieuwe API
routes: neem die check over, anders is dat een gat.

**11. `export const dynamic = 'force-dynamic'` op elke API route.**
Zonder dat cachet Vercel de GET en krijg je na opslaan een oude versie terug. Ook op
`/kaart` (leest env var op de server).

**12. Bewust géén service worker.**
De PWA is manifest + iconen, meer niet. Voeg er geen offline-caching aan toe zonder dat
expliciet te bespreken: gecachete JS naast een gedeeld Redis-document geeft precies de
"waarom zie ik oude data"-klasse bugs die punt 4 probeert te vermijden.

## Stijl

- Inline style-objecten, kleuren uit `COLORS` in `lib/data.js`. Geen CSS-framework
  toevoegen.
- Fonts (Fraunces + DM Sans) komen via `@import` in `globals.css`.
- Nederlandse UI-teksten en commentaar, mobiel-eerst (de app wordt op de telefoon
  gebruikt, vaak met slecht bereik).
