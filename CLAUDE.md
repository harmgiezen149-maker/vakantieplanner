# CLAUDE.md — architectuur en valkuilen

Werkinstructies voor Claude Code in deze repo. De README is de *gebruikers*-handleiding
(deployen, env vars, Vercel); dit document is de *ontwikkelaars*-kant: hoe het in elkaar
zit en waar je je aan bezeert. **`ROADMAP.md`** houdt bij wat er nog komt en in welke
volgorde — begin daar als de eigenaar vraagt "wat is de volgende stap".

## Wat dit is

Gedeelde familie-vakantieplanner. Next.js 15 App Router, React 19, JavaScript (geen
TypeScript), inline style-objecten (geen CSS-framework, geen Tailwind), Upstash Redis als
enige opslag. Draait op Vercel. Alle UI-tekst is **Nederlands** — houd dat zo, inclusief
code-commentaar.

## Commando's

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit-tests, moeten slagen vóór je pusht
npx next build       # moet ook slagen vóór je pusht
```

In een websessie draait `npm install` al via de SessionStart-hook
(`.claude/hooks/session-start.sh`), dus `npx next build` kan meteen.

**Draai `npx next build` nooit terwijl `npm run dev` loopt.** Ze delen de map `.next`, dus
de build sloopt de draaiende dev-server (`ENOENT … vendor-chunks/…`). Stop de dev-server
eerst; is het al misgegaan, dan `rm -rf .next` en opnieuw starten.

**De poort is `npm test` én `npx next build`.** Beide moeten slagen vóór een merge naar
`main`. Er is geen linter-config.

De tests draaien op `node --test` (in Node ingebouwd, geen extra afhankelijkheid) en staan
in `test/`. Ze dekken de rekenkundige kern: `buildDays` en de override-regels in `data.js`,
de reisgroepering in `stayLog.js`, de inpaklijst-invariant in `packing.js`, het opruimen van
reservekopieën in `backup.js`, het uitlezen van Maps-links in `maps.js` en `mapsLink.js`,
de gedeelde plek in `deelPlek.js`, het samenvoegen van
meldingen in `errorLog.js`, de versiecontrole in `conflict.js`, de cachesleutels in
`geoCache.js`, de reisstatistiek in `reisverslag.js`, de deel-link in `delen.js`,
het rekenwerk in `uitgaven.js`, de offline-kopie in `offline.js`,
de bezoekkoppeling in `bezoek.js`,
de routevolgorde in `volgorde.js`,
het hernoemen van een reis in `stayLog.js`,
het huidige verblijf en de activiteiten eromheen in `data.js`,
de CSV-import en de
opschoning in `stayValidation.js`.

Twee dingen om te weten als je tests toevoegt:

- **Alleen pure logica.** Componenten en API-routes worden niet getest; die controleer je in
  de browser tegen een Redis-stub. Wil je iets uit een component testbaar maken, haal het
  dan eerst naar `lib/` — zo zijn `packing.js` en `stayValidation.js` ontstaan.
- **`lib/`-modules importeren elkaar relatief** (`./data.js`), niet via `@/lib/…`. De
  padalias is van Next; plain Node kent hem niet en de tests draaien buiten Next om.
  De afhankelijkheid loopt één kant op: `data.js` gebruikt `hemelsbreed()` uit
  `volgorde.js` (voor `verblijfPerActiviteit`), en `volgorde.js` importeert niets. Houd
  dat zo, anders krijg je een kringloop die pas op runtime opvalt.
  De build slaagt zonder Redis-env-vars (je ziet dan alleen
`[Upstash Redis] Unable to find environment variable` tijdens page-data-collectie); de
API's falen dan pas op runtime.

## Git en deployen — dit doe je zelf

De eigenaar (harmgiezen149) heeft op 5 augustus 2026 expliciet gevraagd om
wijzigingen zelfstandig af te ronden: **committen, naar `main` mergen en pushen
zonder er eerst toestemming voor te vragen.** Dat is staande toestemming voor dit
project; je hoeft er niet per sessie opnieuw naar te vragen.

Vaste volgorde voor elke wijziging:

```bash
git pull --ff-only origin main     # eventuele web-edits eerst binnen
# … wijzigingen …
npm test                           # POORT 1
npx next build                     # POORT 2: slagen ze niet, dan niet mergen
git add -A && git commit -m "…"
git checkout main && git merge --ff-only <werkbranch>
git push -u origin main
```

Regels die daarbij horen:

- **`npm test` en de build zijn samen de poort.** Slaagt één van de twee niet, dan
  gaat er niets naar `main` — dan laat je het op een branch staan en meld je wat er
  stuk is.
- **Pushen naar `main` = live deployen.** Vercel deployt automatisch op `main`; het
  gezin gebruikt de app tijdens de vakantie. Bij iets dat je niet met een build kunt
  verifiëren (gedrag dat alleen met echte Redis-data blijkt, of een wijziging in het
  datamodel): eerst op een branch, en de eigenaar laten kijken.
- **Krijg je in de sessie een aangewezen werkbranch** (`claude/…`), gebruik die dan
  om op te werken en merge hem daarna fast-forward in `main`. De branch is een
  werkplek, niet het eindstation.
- **Nooit force-pushen of `main` herschrijven.** `.claude/settings.json` blokkeert
  `--force`, `reset --hard` en ref-deletes; dat is opzet, omzeil het niet.

Wat een sessie **niet** kan: een remote branch verwijderen. `git push origin --delete`
geeft HTTP 403 — de git-credential van een sessie mag wel pushen, maar geen refs
verwijderen, en de GitHub-tools hebben geen delete-branch-functie. Opgeruimde branches
zijn dus handwerk voor de eigenaar (GitHub → Branches → prullenbak). Blijf er niet op
doorproberen; meld het en ga door.

## Structuur

```
app/
  page.jsx                → Planner        (hoofdscherm: plan + bibliotheek)
  kaart/page.jsx          → MapView        (alle activiteiten op de kaart)
  dag/page.jsx            → DayOverview    (dag-voor-dag, route te voet of met de auto + GPX)
  inpakken/page.jsx       → PackingList
  checklist/page.jsx      → Checklist
  verblijven/page.jsx     → StayLog        (logboek: kaart, cijfer, review, foto's)
  verslag/page.jsx        → Reisverslag    (terugblik: nachten, landen, cijfers)
  bekijk/page.jsx         → Bekijken       (alleen-lezen deel-link, zonder PIN)
  uitgaven/page.jsx       → Uitgaven       (kasboek: per categorie en per persoon)
  beheer/page.jsx         → Beheer         (kopieën, fouten, opruimen — eigen wachtwoord)
  uitleg/page.jsx         → Uitleg         (handleiding in 17 punten; statisch)
  toevoegen/page.jsx      → DeelOntvangen  (deeldoel van de telefoon: Maps → planner)
  reservekopie/, fouten/  → sturen door naar /beheer (oude bladwijzers)
  layout.jsx, manifest.js, icon.svg, globals.css   (PWA + huisstijl)
  api/
    plan/       GET/PUT   hoofddocument (dagen, activiteiten, reisconfig)
    inpakken/   GET/POST  inpaklijst
    checklist/  GET/POST  auto- & documentenchecklist
    geocode/    GET       Nominatim-zoeken
    route/      POST      autoroute (ORS met key, anders publieke OSRM)
    matrix/     POST      alle onderlinge rijafstanden (voor "Slimme volgorde")
    suggest/    GET/POST  "Ontdek de omgeving" — bezienswaardigheden
    hiking/     POST      wandelroutes uit OSM-relaties
    resolve-maps/ POST    Google Maps-link → naam + coördinaten
    whats-here/ GET/POST  POI's rond een aangeklikt kaartpunt
    fouten/     GET/POST/DELETE  foutenlogboek (melden mag zonder PIN)
    backup/     GET/POST  reservekopieën: lijst / nieuwe maken
    backup/run/ GET       adres van de dagelijkse Vercel-cron
    backup/download/      alles als JSON downloaden (werkt zonder Blob)
    backup/restore/ POST  momentopname terugzetten
    verblijven/ GET/POST  verblijvenlogboek
    verblijven/upload/    uploadtoken voor Vercel Blob
    verblijven/foto/      foto verwijderen uit Blob (DELETE)
    delen/      GET/POST/DELETE  deel-link beheren (beheer-gated)
    delen/bekijk/ GET     de uitgeklede planning achter een token (open!)
    delen/dagroute/ GET   de route van één dag achter datzelfde token (open!)
    uitgaven/   GET/POST  kasboek van de reis
    weer/       GET       weersverwachting per dag (Open-Meteo, geen sleutel)
    versie/     GET       welke build er draait (voor de update-melding)
components/   Planner.jsx (planscherm), MapView.jsx, DayOverview.jsx,
              PackingList.jsx, Checklist.jsx, StayLog.jsx, LocationPicker.jsx,
              Beheer.jsx, BackupBeheer.jsx, FoutenLijst.jsx,
              Poort.jsx (PinPoort + BeheerPoort), ConflictMelding.jsx,
              OfflineMelding.jsx, Foutmelder.jsx, VersieWacht.jsx,
              Reisverslag.jsx, Uitgaven.jsx,
              Bekijken.jsx, DeelLink.jsx, Uitleg.jsx, DeelOntvangen.jsx
  planner/    de sheets van het planscherm — zie hieronder
lib/          data.js (palet, categorieën, buildDays, overrides), maps.js
              (Maps-links + PIN), mapsLink.js (link/HTML/adres uitlezen),
              stayLog.js, stayTypes.js, backup.js, csv.js, deelPlek.js,
              bezoek.js, conflict.js, delen.js, errorLog.js, geoCache.js, packing.js,
              reisverslag.js, stayValidation.js, toegang.js, uitgaven.js,
              volgorde.js, routeDienst.js, weer.js, offline.js, redis.js,
              useRoute.js, useWeer.js
```

`components/Planner.jsx` was één bestand van 4.100 regels en is opgesplitst: alle sheets
staan nu in `components/planner/`. De scheidslijn is **props versus state** — elke sheet
hangt alleen aan zijn props en leest niets uit `Planner`, dus ze konden er los uit. Wat
in `Planner.jsx` bleef (`Header`, `TabBar`, `ActivityChip`, `DayCard`, `PlanView`,
`LibraryView`, `SettingsSheet`, en `Planner` zelf) is het planscherm; die delen wél
state en props-vormen en horen bij elkaar.

```
components/planner/
  Sheet.jsx              de bodemsheet + labelStyle/inputBaseStyle (iedereen importeert dit)
  PickSheets.jsx         PickActivitySheet + PickDaySheet
  TripSettingsSheet.jsx  titel, periode, verblijven
  CustomActivityForm.jsx eigen activiteit aanmaken
  LocationEditSheet.jsx  locatie van een bestaande activiteit
  ConfirmSheet.jsx       bevestigingsvraag (met optionele derde knop)
  PasteLinkSheet.jsx     Google Maps-link plakken
  InDeBuurtSheet.jsx     zoeken op je huidige locatie (GPS + /api/suggest)
  WhatsHereSheet.jsx     POI's rond een aangeklikt kaartpunt
  SuggestionsSheet.jsx   "Ontdek de omgeving" + HikingMap + SuggestionsMap (~1.480 r.)
```

Twee dingen om te weten:

- **`WhatsHereSheet` bestaat twee keer.** De versie hierboven wordt door
  `SuggestionsSheet` gebruikt; `MapView.jsx` heeft een eigen kopie die de sheet-chrome
  inline heeft staan in plaats van `Sheet` te gebruiken. Dat is geen slordigheid maar
  noodzaak: `Sheet` zit op `z-index` 50/51 en zou daar ónder de Leaflet-panes van de
  kaart vallen, waar de kopie 1000/1001 gebruikt. Voeg je ze samen, dan moet die
  z-index eerst geregeld zijn.
- `LocationPicker` staat bewust een niveau hoger (`components/`), want het
  verblijvenlogboek gebruikt hetzelfde veld; hergebruik op een tweede pagina is de
  drempel om iets uit `planner/` te halen.

## Datamodel

Zeven losse Redis-documenten, elk één JSON-blob:

| Key | Vorm |
| --- | --- |
| `planner:trip` | `{ plan, customActivities, locationOverrides, tripConfig, suggestExclusions, routeAnkers, updatedAt, updatedBy }` |
| `planner:inpakken` | `{ categories:[{id,name}], personen:[naam], items:[{id,categoryId,label,qty,checked,packed,important,note,person}], updatedBy, updatedAt }` |
| `planner:checklist` | `{ checked:{}, updatedBy, updatedAt }` |
| `planner:verblijven` | `{ stays:[{id,name,locationLabel,coords,type,typeOther,country,countryCode,startDate,endDate,periodLabel,website,tripTitle,score,review,photos,bezocht,source}], updatedBy, updatedAt }` |
| `planner:fouten` | `{ fouten:[{bron,bericht,detail,pad,versie,aantal,eerst,laatst}], updatedAt }` — max 100 |
| `planner:uitgaven` | `{ uitgaven:[{id,datum,bedrag,omschrijving,categorie,betaaldDoor,activityId}], personen:[naam], updatedBy, updatedAt }` |
| `planner:delen` | `{ token, actief, aangemaakt, aangemaaktDoor, ingetrokken? }` — één link tegelijk |

Daarnaast staan er `cache:v1:*`-sleutels in dezelfde Redis. Die horen niet bij het
datamodel: ze zijn afgeleid, hebben een vervaltijd en mogen op elk moment weg — zie
valkuil 7. Ze gaan dan ook **niet mee in de reservekopie**.

De eerste drie lezen eenmalig een **legacy key** (`vosges:family-plan`,
`vogezen2026:*`) als de nieuwe leeg is. Niet weghalen — dat is de migratie van de oude
Vogezen-versie.

`planner:verblijven` staat er bewust náást en niet ín `planner:trip`: dat laatste
document wordt gewist bij "Nieuwe vakantie starten", en het logboek moet die reset juist
overleven. Foto's staan niet in Redis maar in **Vercel Blob**; het document bewaart per
foto alleen `url` en `pathname` (die laatste heb je nodig om hem te kunnen verwijderen).

Kern van het hoofddocument:

- `plan` = `{ 'YYYY-MM-DD': [activityId, …] }` — **alleen id's, geen kopieën**.
- `customActivities` = eigen activiteiten (`custom_<timestamp>`), inclusief `coords`,
  `mapsQuery`, `note`, `important`, `routeGeometry`.
- `locationOverrides` = `{ activityId: {…} }`, het override-mechanisme voor de
  ingebouwde activiteiten uit `DEFAULT_ACTIVITIES` (`g_*`), die read-only zijn.
- `tripConfig` = titel, `startDate`, `endDate`, `stays[]`. `buildDays(tripConfig)` leidt
  hier de dagenlijst uit af (max 90 dagen, wisseldag = dag die in twee verblijven valt).
- `routeAnkers` = `{ 'YYYY-MM-DD': { start, eind } }`, het vaste begin- en eindpunt van
  de route van die dag. Alleen dagen mét een anker staan erin — zie valkuil 20.

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

**4. Sync heeft drie vangnetten, en één ervan is zichtbaar.**
Opslaan is gedebounced (500 ms in `Planner`, vergelijkbaar in `PackingList`), en elke
pagina herlaadt bij `window.focus`. Twee refs voorkomen dat die twee elkaar slopen:
`skipNextSave` (na een fetch niet meteen terugschrijven) en `dirty` (focus-refresh
overslaat zolang lokale wijzigingen nog niet opgeslagen zijn — vuurt o.a. na een
confirm-popup). Haal ze niet weg; zonder die refs verlies je de laatste bewerking.

Het derde vangnet is de **versiecontrole** in `lib/conflict.js`. Elke pagina onthoudt in
een `versie`-ref de `updatedAt` die ze bij het ophalen terugkreeg en stuurt die mee als
`basisVersie`. Staat er in Redis intussen iets nieuwers, dan **weigert de route met
HTTP 409** en stuurt de huidige serverstaat mee; `components/ConflictMelding.jsx` toont
dan de keuze "Hun versie laden" of "Toch de mijne opslaan". Drie dingen om te weten:

- **409 is geen fout maar een vraag.** Behandel hem niet als netwerkstoring — de
  gebruiker is de enige die weet welke van de twee wijzigingen de belangrijkste is.
- **Geen `basisVersie` meesturen = bewust doorschrijven.** Dat is precies wat "toch de
  mijne opslaan" doet, en het houdt een oude tab die de app nog zonder versies draait
  werkend. `isConflict()` geeft daarom `false` bij `undefined`/`null`.
- **Nieuw document = ook deze controle.** Voeg je een vijfde Redis-document met een
  schrijfroute toe, neem dan de lees-vóór-schrijf-tak over, anders is dat gat terug.

Wat dit *niet* doet: samenvoegen. Vinken twee mensen elk een ander item af, dan blijft
het kiezen tussen twee volledige versies. Dat vraagt een datamodel per veld en is de
moeite pas waard als het in de praktijk knelt.

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

Daar bovenop ligt `lib/geoCache.js`: geslaagde antwoorden van `suggest/`, `hiking/`,
`whats-here/`, `geocode/` en `matrix/` gaan onder `cache:v1:<naam>:<sleutel>` in Redis. Twee keer
dezelfde omgeving opvragen kost dus één keer Overpass, en een omgeving die je eerder
bekeek werkt ook op een dag dat de servers nors zijn. Vier regels bij het aanhaken van
een nieuwe route:

- **De sleutel staat op de geklémde waarden**, ná het opschonen van de parameters, niet
  op de ruwe invoer — anders krijgen `radius=99999` en `radius=50000` twee sleutels voor
  hetzelfde antwoord. Afronding bepaalt de trefkans: 2 decimalen (~1,1 km) voor een
  omgeving, 4 (~11 m) voor een aangeklikt punt, 1 voor het land bij reverse geocoding.
- **Alleen geslaagde, niet-lege antwoorden.** Een 502 of een lege lijst is meestal
  Overpass die niet meewerkt, niet de werkelijkheid; die zit je anders een maand achterna.
- **De cache mag nooit een verzoek laten mislukken.** Lezen én schrijven falen stil en
  vallen terug op de externe dienst. Zonder Redis-env-vars werkt alles precies als
  voorheen — dat is met opzet en is getest.
- **Melden gaat via `console.warn`, niet via `meldServerFout()`.** Dat foutenlogboek
  staat zelf in Redis, dus juist als de cache er niet bij kan komt de melding daar nooit
  aan. `CACHE_VERSIE` ophogen laat alles onder de oude sleutel vanzelf vervallen.

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
Staat `FAMILY_PIN` niet ingesteld, dan is alles open — inclusief
`POST /api/backup/restore`, dat álles overschrijft. Staat hij wel, dan verwacht elke
route `X-Family-Pin` (de client haalt hem uit `localStorage['planner-pin']`). Nieuwe API
routes: neem die check over, anders is dat een gat.

**Er zijn twee sloten, en ze doen niet hetzelfde.** `lib/toegang.js` is de enige plek
waar dat wordt beslist:

| | env var | header | waarvoor |
| --- | --- | --- | --- |
| Familie-PIN | `FAMILY_PIN` | `X-Family-Pin` | "is dit het gezin?" |
| Beheer | `BEHEER_WACHTWOORD` | `X-Beheer-Code` | terugzetten, downloaden, wissen |

Beheer is een **extra laag bovenop** de PIN (`magBeheren()` = allebei), geen vervanging.
Allebei optioneel: niet ingesteld = dat slot staat open, zodat er niets breekt vóórdat
de eigenaar de variabele zet. Beheer geldt voor `GET/POST /api/backup`,
`/api/backup/download`, `/api/backup/restore` en `DELETE /api/fouten`. **`POST
/api/fouten` blijft open** — valkuil 18. De cron met `CRON_SECRET` komt langs beide.

**De poort staat in `components/Poort.jsx`, niet in een pagina.** Hij zat vroeger als
`PinGate` binnenin `Planner.jsx`, en dus kon alléén het beginscherm om een PIN vragen;
wie `/reservekopie` opende op een apparaat dat nooit via `/` binnenkwam kreeg 401's
zonder manier om in te loggen. Nu zet je `<PinPoort>` of `<BeheerPoort>` om een pagina
heen. Bouw je een nieuwe pagina die toegang nodig heeft: gebruik die wrapper, maak geen
tweede kopie van de gate.

`BeheerPoort` leest uit het 401-antwoord **welk** slot dicht zat (`{ slot: 'pin' | 'beheer' }`
uit `weigering()`) en toont de bijbehorende vraag. Dat is één state-machine met vier
standen; hem opsplitsen in twee geneste poorten geeft precies de bug die er eerst in zat —
de PIN klopte, en de wachtwoordvraag werd overgeslagen.

**10b. Twee routes onder `/api/delen/` staan bewust open.**
Zonder PIN, zonder beheercode — dat is het hele punt van een meekijk-link. De grendel is
het token (32 hex, één tegelijk, intrekbaar). Wat naar buiten gaat wordt daarom bepaald
door `publiekePlanning()` in `lib/delen.js`, en dat is een **witte lijst**: het bouwt een
nieuw object uit de velden die het kent, in plaats van velden weg te strepen uit wat het
krijgt. Voeg je later iets toe aan `planner:trip`, dan lekt dat dus niet automatisch mee.
Houd die vorm zo. Wat er bewust níét in zit: `updatedBy` (namen van het gezin),
`suggestExclusions`, het verblijvenlogboek, foto's, en activiteiten die op geen enkele dag
staan. `/bekijk` heeft geen `PinPoort` en geen enkele knop die schrijft — er staat ook geen
opslagcode in `components/Bekijken.jsx`, en dat is makkelijker te bewaken dan een
alleen-lezen stand van `Planner`.

De tweede is **`/api/delen/dagroute`**, voor de route van één dag op de meekijkpagina. Die
is met opzet *smal*: de bezoeker geeft **alleen een datum** mee en geen punten. De server
zoekt zelf op wat er die dag gepland staat (`dagRouteVraag()` in `lib/delen.js`) en rekent
dáárvan de route uit. Doe dat niet anders — accepteerde hij punten, dan was de deel-link
een open routeserver waarmee iemand jouw ORS-quotum kan leegtrekken met ritten door heel
Europa. Twee dingen die daar bij horen: het antwoord bevat alleen routegegevens (dus geen
namen, notities of `routeAnkers` — de server mág de vervoerkeuze weten, de bezoeker niet),
en het resultaat gaat in de Redis-cache, zodat vijf familieleden die dezelfde dag openen
samen één aanvraag kosten. Het rekenwerk zelf staat in `lib/routeDienst.js`, gedeeld met
`/api/route`, zodat de twee paden niet uit elkaar kunnen lopen.

**10c. Geld staat in hele centen, als integer.**
`lib/uitgaven.js` rekent nergens met euro's als kommagetal, want `0.1 + 0.2` is
`0.30000000000000004` en dat wil je niet in een kasboek. `naarCenten()` zet de invoer om
(komma én punt, met of zonder euroteken) en geeft **`null`** bij onleesbare invoer — niet
`0`, anders sluipt er stilzwijgend een uitgave van niets in de lijst. `verdeel()` heeft
één eigenschap die er echt toe doet: de som van de delen is exact het oorspronkelijke
bedrag, dus de restcent gaat naar de eerste personen in plaats van te verdampen. Er is
een test die dat voor elk bedrag van 0 t/m 200 cent over 1 t/m 7 personen nagaat.

**11. `export const dynamic = 'force-dynamic'` op elke API route.**
Zonder dat cachet Vercel de GET en krijg je na opslaan een oude versie terug. Ook op
`/kaart` (leest env var op de server).

**12. Foto's: uploaden gaat buiten de server om.**
De browser praat rechtstreeks met Vercel Blob; `/api/verblijven/upload` geeft alleen een
token af. Twee dingen om te onthouden: `upload()` kan geen eigen headers meesturen, dus de
familie-PIN gaat mee als `clientPayload` en wordt in `onBeforeGenerateToken` gecontroleerd.
En `onUploadCompleted` vuurt **niet lokaal** (Blob moet die callback publiek kunnen
bereiken), dus hang er geen opslag aan — de client schrijft de teruggekregen URL zelf weg.
Foto's worden vóór het uploaden in de browser verkleind tot max 1600 px.

**13. Een geplakte Maps-link is zelden een kale URL.**
De deelknop van de Google Maps-**app** zet er de naam en vaak het adres vóór
("Camping X\nRoute…\nhttps://maps.app.goo.gl/…"); uit de adresbalk van de browser komt
wél een kale URL. Test dus nooit met `new URL(hele veld)` — gebruik `extractUrl()` uit
`lib/maps.js`, dat de eerste link uit de tekst vist, en `labelBeforeUrl()` voor de naam
ervoor. `LocationPicker` leest bij plakken bovendien de ruwe kleminhoud via `onPaste`,
omdat een invoerveld van één regel de regeleindes wegpoetst en naam en adres anders aan
elkaar plakken.

**13b. Een korte deel-link geeft géén coördinaten, en dat gaat nooit veranderen.**
Dit is de kern van `/api/resolve-maps` en het is niet vanzelfsprekend.
`maps.app.goo.gl/…` stuurt keurig door (status 200, twee hops — Google werkt gewoon
mee), maar de URL waar hij op uitkomt ziet er zo uit:

```
/maps/place/Kilefjorden+Camping,+Ivelandsvegen+2,+4737+Hornnes,+Noorwegen/data=!4m2!3m1!1s0x46…
```

Naam en volledig adres, maar geen `@lat,lng` en geen `!3d/!4d`. Die worden pas door de
kaartpagina zélf aan de URL geplakt nadát die in een browser geladen is — dáárom werkt
"in Chrome plakken en de adresbalk overnemen" wel. **Ga hier dus geen betere headers of
een slimmere user-agent op loslaten**; dat is op 6 augustus 2026 geprobeerd (`59de95a`)
en het probleem zit niet in de verbinding.

Wat er wél werkt staat in `lib/mapsLink.js` en is pure, geteste logica. Drie bronnen op
volgorde, en welke het werd staat als `bron` in het antwoord:

| `bron` | waar het coördinaat vandaan komt | |
| --- | --- | --- |
| `'link'` | de URL zelf | exact |
| `'pagina'` | de HTML van de kaart | exact |
| `'adres'` | opgezocht bij het adres uit `/place/` | bij benadering |

Vier dingen die daarin vastliggen:

- **Het land gaat niet mee in de zoekopdracht.** De Maps-app levert hem in de taal van
  de telefoon ("Noorwegen", niet "Norge") en een vrije Nominatim-zoekopdracht moet op
  álle woorden matchen. Juist dat woord maakte de oude versie — die de hele string in
  één keer opstuurde — structureel kansloos. `splitsPlaceAdres()` haalt het land eruit
  en bewaart het apart; `zoekLadder()` gebruikt postcode + plaats.
- **De ladder gaat van scherp naar ruim** (gestructureerd → naam + plaats → straat +
  postcode → naam) en stopt bij de eerste treffer. In de praktijk vindt sport 1 een
  klein Noors adres níét en sport 2 wel; die volgorde is dus geen sier.
- **`bron: 'adres'` wordt tegen de gebruiker gezegd.** `LocationPicker`,
  `PasteLinkSheet` en `/toevoegen` tonen dan "bij benadering" mét het opgezochte adres.
  Een speld die stilletjes een straat verderop staat is erger dan een speld met een
  bijschrift.
- **Nominatim mag één verzoek per seconde** (valkuil 15), dus de sporten gaan
  sequentieel met ~1,1 s ertussen. Daarom staat er `maxDuration = 30` op de route en
  ligt er een `TOTAAL_BUDGET_MS`-deadline overheen: loopt hij tegen Vercels standaard
  van 10 s aan, dan krijgt de client een 504 zónder JSON en kan hij niet eens zeggen
  wat er misging.

Mislukt alles, dan is de melding geen `window.alert` meer maar een regel ín het
formulier met twee uitwegen ("Zoek op naam", "Openen in Maps") en de link blijft staan.

**13c. De deelknop werkt niet overal, en dat ligt niet aan ons.**
`app/manifest.js` heeft een `share_target` naar `/toevoegen`, zodat de planner in het
deelmenu van de telefoon verschijnt. Methode **GET**: een POST-deeldoel vereist een
service worker met fetch-handler, en die willen we niet (valkuil 19). Twee beperkingen
van het platform: het werkt alleen als de app op het beginscherm is **geïnstalleerd**,
en **Safari/iOS kent Web Share Target niet** — op een iPhone blijft plakken de weg.
`/toevoegen` heet bewust niet `/deel`: "delen" is in deze app al de meekijk-link.

Vanaf `/toevoegen` gaan **twee wegen** verder, want een camping is iets anders dan een
uitje: "Bij mijn ideeën" schrijft een activiteit in `customActivities` en doet dat ter
plekke, en "Als verblijf" stuurt door naar `/verblijven` met het formulier voorgevuld.
Dat tweede is bewust een doorverwijzing en geen tweede formulier — `StayForm` bestaat al
mét datums, soort, cijfer en review, en `addStay()` regelt id, landafleiding en opslag.
Een eigen opslagpad naar `/api/verblijven` ernaast zou volgens valkuil 4 uit elkaar gaan
lopen, en foto's kun je toch pas toevoegen nadat het verblijf bestaat.

De plek reist mee in de URL, en die querystring is invoer van buiten: `lib/deelPlek.js`
bouwt en leest hem, met bereikcontrole op de coördinaten en `schoneWebsite()` over de
link. Let op de valkuil die daar getest is — **`Number('')` is `0` en niet `NaN`**, dus
zonder een expliciete lege-controle wordt een ontbrekende `lng` stilletjes een speld in
de Golf van Guinee. `StayLog` wist de parameters daarna met `router.replace()`: anders
opent elke verversing — en de focus-refresh doet er nog een — hetzelfde formulier
opnieuw, en typ je je verblijf twee keer in.

Wat er **niet** wordt voorgevuld: datums (die weten we niet) en het soort verblijf.
OpenStreetMap zegt hooguit `caravan_site`, terwijl `STAY_TYPES` tent, caravan, camper en
stacaravan onderscheidt; een voorselectie die er soms naast zit tik je niet weg. Het land
komt langs de bestaande weg — `addStay()` roept `reverseCountry()` aan zodra er
coördinaten maar geen land zijn — want één afleidingsweg is beter dan twee die uiteen
kunnen lopen.

**14. Reizen zijn afgeleid, niet opgeslagen.**
`groepeerReizen()` in `lib/stayLog.js` plakt verblijven aan elkaar die in de tijd tegen
elkaar aan liggen (gat ≤ `MAX_GAT_DAGEN`, nu 5), met `tripTitle` als bovenliggende regel:
twee verschillende gearchiveerde reizen worden nooit samengevoegd, ook niet als ze op
elkaar aansluiten. Er staat dus **geen reis-id in het datamodel** — pas je de datums van
een verblijf aan, dan verschuift de groepering vanzelf. Groeperen gebeurt op de hele
lijst en niet op de gefilterde: anders hakt een filter een reis in stukken. De route op de
kaart is een rechte lijn tussen de verblijven in datumvolgorde, geen echte rijroute.

**Een reis een eigen naam geven verandert daar niets aan.** `hernoemReis()` schrijft de
naam als `tripTitle` op **alle** verblijven van de groep — er komt dus géén reis-id bij,
en dat moet zo blijven. Twee gevolgen die je moet kennen: een lege naam wist het veld en
de afgeleide naam ("jul 2019") komt terug, en twee aaneensluitende groepen met
**verschillende** titels worden nooit samengevoegd. Dat laatste is geen bijwerking maar de
manier om twee vakanties die de automaat aan elkaar plakte alsnog los te trekken.

`lib/reisverslag.js` bouwt daarop voort en telt niets zelf op wat het datamodel al weet.
De jaren komen er uitgesplitst uit (`jaren[].delen`, één stukje per reis) zodat de balk op
`/verslag` laat zien dat een jaar van 27 nachten twee losse vakanties waren; die stukjes
worden per reisgroep geteld en tellen per jaar exact op tot hetzelfde totaal — er is een
test die dat voor elk jaar nagaat.
Twee keuzes die daarin vastliggen en die je moet kennen voor je de cijfers aanpast: een
nacht hoort bij de dag waaróp je slaapt (10 t/m 14 augustus = 4 nachten, zoals een
camping rekent), en een verblijf **zonder cijfer telt wel mee als verblijf maar niet in
het gemiddelde** — `null` is "nog niet beoordeeld", niet "een nul". Een reis over oud en
nieuw verdeelt zijn nachten over beide jaren; als réis hoort hij bij het jaar waarin hij
eindigt (dezelfde regel die de afgeleide naam "aug 2026" gebruikt), en dat is wat
`totaal.aantalReizen` telt.

Vier regels erbij, die er zijn gekomen door de statistiek naast de echte data te leggen:

- **Tellen gebeurt in nachten, niet in verblijven.** `tel()` geeft allebei terug
  (`{ naam, aantal, nachten }`) maar sorteert op nachten, en de pagina zet dat getal
  voorop. Achttien korte verblijven in Noorwegen zijn minder nachten dan acht lange in
  Denemarken, en dát is wat je wilt zien.
- **Het gewogen gemiddelde weegt met `Math.max(nachten, 1)`.** Zonder die klem krijgt een
  beoordeeld dagbezoek gewicht nul en verdwijnt het cijfer stilletjes. `gemiddeldCijfer`
  (ongewogen) blijft ernaast bestaan; de pagina toont `gemiddeldCijferGewogen`.
- **`jaren[].reizen` telt de reizen die een nácht in dat jaar hadden**, dus precies het
  aantal stukjes in de balk. Eerder telde het het eindjaar, en dan sprak het getal de
  balk tegen. Voor "bij welk jaar hoort deze reis" is `reis.jaar` er nog steeds.
- **`vulJarenAan()` vult de overgeslagen jaren aan** zodat de as niet verspringt, en
  `groepeerLegeJaren()` vouwt een reeks van drie of meer samen tot één regel. Wat daarbij
  telt als leeg is **een jaar zonder reis, niet een jaar zonder nachten**: "zomer 2003"
  levert nul nachten op maar je bent er wel geweest, en dat mag niet in een gat verdwijnen.

De afstanden op `/verslag` zijn **hemelsbreed** (`afstandVanReis()` met `hemelsbreed()`
uit `volgorde.js`), niet gereden — 38 verblijven zouden anders tientallen routeaanvragen
kosten voor een pagina die je één keer per jaar opent. Het label zegt dat er ook bij;
haal dat woord niet weg.

**14b. Bezocht staat twee keer, en dat is met opzet.**
Een activiteit krijgt `visited: true` in `planner:trip` (via `updateActivityProps`, dus
custom → `customActivities`, ingebouwd → `locationOverrides`). Het verblijvenlogboek
bewaart daarnáást een **momentopname** in `stay.bezocht`: naam, emoji, notitie, coords en
datum. Geen verwijzing, een kopie — want `planner:trip` wordt gewist bij "nieuwe vakantie
starten", en dát is precies het moment waarop je je terugblik wilt kunnen bekijken.
Zelfde afweging als bij de foto's.

Aanvinken kan op drie plekken: op de chip in de planning, op `/dag`, en in de
bibliotheek. Dat laatste is er omdat de planning lang niet altijd wordt gevolgd — je doet
onderweg dingen die er niet in stonden.

**En er is een vierde weg, die de planning helemaal overslaat.** Onder een verblijf staat
"Zelf toevoegen" (`BezoekForm` in `StayLog.jsx`), want bij een camping uit 2003 valt er
niets uit een planning te halen: die heeft nooit bestaan. `handmatigBezoek()` in
`lib/bezoek.js` bouwt zo'n regel en geeft hem een id in een **eigen ruimte** (`hand_…`).
Dat is het hele trucje: een `hand_`-id botst nooit met een `g_*` of `custom_*`, dus
"Bijwerken uit de planning" laat de regel met rust in plaats van hem te overschrijven of
er een tweede naast te zetten. Verder loopt alles langs dezelfde weg — `voegBezoekToe()`
sorteert, `updateStay()` slaat op, dus debounce, versiecontrole en botsingsbalk gelden
vanzelf. De opschoning in `sanitizeStay()` kende deze vorm al; er hoefde niets aan de API
of het datamodel te veranderen.

**`/dag` was tot dan toe alleen-lezen en is dat nu niet meer.** Daar hoorden drie dingen
bij, en die moeten blijven staan: de PUT stuurt `tripConfig` en `suggestExclusions`
bewust **niet** mee zodat de route ze uit de opgeslagen staat terughaalt (valkuil 3),
`basisVersie` gaat mee met de botsingsbalk erbij (valkuil 4), en offline is de knop
uitgeschakeld (valkuil 19 — je zou anders op een gedateerde kopie schrijven). Staat zo'n activiteit nog nergens op een dag, dan **vraagt de
app eerst wélke dag** het was: zonder dag valt het bezoek bij geen enkel verblijf, en dan
zou het aanvinken stilletjes niets opleveren.

`lib/bezoek.js` koppelt de twee: `bezoekPerVerblijf()` zoekt per verblijf de aangevinkte
activiteiten waarvan de dag binnen de periode valt. Twee dingen die daarin vastliggen:
een **wisseldag telt bij allebei** de verblijven (je bent er die dag allebei geweest), en
een activiteit die op twee dagen staat levert **één regel met de vroegste datum** — je
bent er niet twee keer voor het eerst geweest. `voegBezoekToe()` laat bestaande regels
staan; daar kan de gebruiker iets aan hebben veranderd.

Sorteren gebeurt met een kale `<`-vergelijking en **niet met `localeCompare`**: die
sorteert leestekens naar eigen inzicht, waardoor een bezoek zonder datum vóór 2026 belandde
in plaats van erachter.

**15. Het land is afgeleid, niet ingetypt.**
`STAY_TYPES` en de landhulpjes staan in `lib/stayTypes.js` — een module **zonder**
`'use client'`, want `app/api/verblijven/route.js` valideert `type` tegen diezelfde lijst.
Zet er dus geen fetch of localStorage in; dat hoort in `lib/stayLog.js`. Het land komt uit
twee bronnen: het `address`-object dat `/api/geocode` bij een zoekresultaat al meelevert
(gratis), en anders reverse geocoding via `/api/geocode?lat=&lng=`. **Nominatim staat één
verzoek per seconde toe**, dus het bijwerken van bestaande verblijven gaat sequentieel met
~1,1 s ertussen — nooit `Promise.all`.

**16. Terugzetten mag nooit zonder vangnet.**
`/api/backup/restore` overschrijft alle documenten. Daarom eist hij `bevestigd: true`, én
maakt hij vlák voor het overschrijven een veiligheidskopie van de huidige staat. Lukt die
kopie niet — of is er geen Blob — dan **weigert** hij, in plaats van door te gaan. Verzwak
die volgorde niet: het verschil tussen een reservekopie en een val is precies dat vangnet.
De cron draait op `/api/backup/run` en niet op `/api/backup`, omdat een Vercel-cron altijd
een GET doet en het maken van een kopie een POST is.

**Een cron heeft geen PIN.** Hij komt uit een datacenter, niet uit een browser met
`localStorage`, dus `X-Family-Pin` stuurt hij nooit mee. `/api/backup/run` controleerde
daar tóch op zodra `CRON_SECRET` niet was ingesteld — met als gevolg elke nacht een 401 en
dagenlang geen reservekopie. Controleer een cron-route dus **nooit** op de familie-PIN;
de regel staat op één plek, `cronBron()` in `lib/toegang.js`, en geeft terug hóe het
verzoek binnenkwam:

| bron | wanneer |
| --- | --- |
| `'secret'` | `Authorization: Bearer $CRON_SECRET` — mét sleutel is dít het enige pad |
| `'cron-header'` | Vercels eigen `x-vercel-cron`, alleen als er géén sleutel is ingesteld |
| `'beheer'` | met de hand afgetrapt, langs `magBeheren()` |
| `null` | geweigerd |

Twee dingen die daaraan vastzitten. Bij `'cron-header'` laat de route `pad` en `url`
**weg** uit het antwoord: die header is geen grendel (iedereen kan hem meesturen) en de
`url` is een publieke Blob-link naar de hele planning. En een weigering gaat via
`meldServerFout()` naar het foutenlogboek — precies omdat de oude 401 vóór alle logging
zat en het probleem daardoor onzichtbaar was.

Daar bovenop ligt een vangnet dat niets weet van de oorzaak: `kopieVerouderd()` in
`lib/backup.js` kijkt alleen naar de nieuwste kopie, en `/beheer` zet er een oranje balk
boven zodra die ouder is dan `MAX_KOPIE_LEEFTIJD_DAGEN` (2). Een verlopen Blob-token of
Redis eruit geeft dezelfde melding. Eén gemiste nacht kan aan van alles liggen, twee op
rij niet.

**17. Afhankelijkheden bewust minimaal — en waarom er nog meldingen staan.**
`xlsx` is eruit gehaald (prototype pollution + ReDoS, geen fix beschikbaar) en vervangen
door `lib/csv.js`. Voeg hem niet terug: de import hoeft alleen kolommen te lezen.
`npm audit` meldt nog drie zaken via Next: `postcss` en `sharp`. Beide zijn hier **niet
bereikbaar** — `next/image` wordt nergens gebruikt (sharp is een optionele dependency die
alleen dáárvoor draait) en postcss verwerkt tijdens de build alleen onze eigen
`globals.css`. De enige "fix" die npm voorstelt is Next 16, een hoofdversie; dat is die
migratie niet waard. Controleer die aanname wel opnieuw zodra `next/image` wél in gebruik
komt.

**18. Het foutenlogboek mag de app nooit raken.**
`components/Foutmelder.jsx` hangt in de root-layout en meldt browserfouten aan
`/api/fouten`. Drie regels die je niet moet verzwakken: melden mag **zonder PIN** (een fout
treedt soms op vóórdat iemand is ingelogd), het melden zelf staat in een `try` die stil
faalt (een kapot logboek mag de app niet omver halen), en er zit een plafond op —
10 meldingen per paginasessie, 30 per minuut per serverinstantie, 100 regels in het
document. Zonder die plafonds vult één pagina die in een lus faalt het hele document.
Dezelfde fout op dezelfde plek wordt één regel met een teller. Voeg je een nieuwe
API-route toe met een stil faalpad, roep dan `meldServerFout()` aan — dat is precies waarom
de nachtelijke reservekopie en het uitlezen van Maps-links het nu doen.

**19. Bewust géén service worker.**
De PWA is manifest + iconen, meer niet. Voeg er geen offline-caching aan toe zonder dat
expliciet te bespreken: gecachete JS naast een gedeeld Redis-document geeft precies de
"waarom zie ik oude data"-klasse bugs die punt 4 probeert te vermijden.

**20. De slimme volgorde: ankers per dag, te voet in de stad, en een matrix die altijd
dezelfde sleutel heeft.**
"Slimme volgorde" op een dagkaart zet de activiteiten van die dag in de kortste route.
Het rekenwerk staat in `lib/volgorde.js` (dichtstbijzijnde buur + 2-opt) en weet niets van
fetch of React: de afstanden komen er als `kosten`-functie in. Vier dingen die vastliggen:

- **De ankers staan per dag in `routeAnkers`, niet op de activiteit.** Dat gaat bewust
  tegen valkuil 1 in: "beginpunt" is een eigenschap van de route van díé dag, niet van de
  plek. Dezelfde parkeergarage kan dinsdag je startpunt zijn en donderdag een tussenstop.
  Nieuw top-level veld betekent ook: valkuil 3 geldt, en die bewaar-tak staat er. In
  hetzelfde blokje staat `vervoer` — daarom heet het veld één ding en bevat het drie.
- **Dicht bij elkaar = te voet, en dan telt het verblijf niet mee.** `kiesVervoer()` kijkt
  naar de grootste afstand tússen de stops (`WANDEL_DREMPEL_M`, nu 2 km) en niet naar de
  afstand tot de camping: naar de stad rijd je, in de stad loop je. In wandelmodus laat
  `optimaliseerDag` `begin` en `eind` daarom weg. Doe je dat niet, dan wint de stop die
  het dichtst bij de camping ligt altijd de eerste plaats, en dat is precies de volgorde
  die je niet wilt. Wie tóch een vast beginpunt wil, zet het startanker.
  **Wandelen kan alleen met een `ORS_API_KEY`** — de publieke OSRM-demoserver rijdt alleen
  auto. Zonder sleutel geven `/api/matrix` en `/api/route` een 501 voor `profiel: 'lopen'`.
  De volgorde rekent dan hemelsbreed (voor een compact centrum een prima benadering, en in
  elk geval beter dan auto-afstanden die om het voetgangersgebied heen sturen), en de kaart
  tekent de stippellijn die hij toch al tekent als er geen route is.
- **De getekende route volgt hetzelfde vervoer.** `/dag` en de dagkaart in de planner
  bepalen het met dezelfde `kiesVervoer()` en bouwen hun puntenlijst met dezelfde
  `routePunten()` — één regel, drie plekken die hem gebruiken, zodat de twee schermen niet
  uit elkaar kunnen lopen. Twee dingen die daarbij horen: `useRoute` heeft het profiel in
  zijn **browsercachesleutel** (anders krijgt een wandeldag de auto-geometrie van dezelfde
  punten terug), en `legIndexByAct` in `DayOverview` kijkt of de route **écht** bij het
  verblijf begint en niet of de dag er een hééft — in wandelmodus valt dat startpunt weg,
  en dan zouden alle etappe-afstanden één activiteit opschuiven.
- **Een anker is een opdracht, geen optimalisatie.** Levert het omgooien niets op, dan
  laat `optimaliseerVolgorde` de lijst met rust — behalve als er een anker staat: dan
  wordt dat uitgevoerd, ook als de route er langer van wordt. De gebruiker wint.
- **De matrix wordt canoniek gesorteerd opgevraagd, mét het profiel in de sleutel.**
  `/api/matrix` sorteert de punten vóór het opvragen en draait dat daarna terug met
  `herstelMatrix()`. Zonder die sortering krijgt dezelfde verzameling punten na elke
  herordening een andere cachesleutel, en is elke tweede klik een misser — precies
  wanneer je hem nodig hebt. Het profiel (`lopen`/`rijden`) hoort er ook in, anders krijgt
  een wandeldag de auto-matrix van dezelfde stops terug.

Mislukt `/api/matrix`, dan rekent de client hemelsbreed door en zegt dat erbij in de
melding. Dat is geen storing maar de terugval: de knop moet het ook doen op een camping
zonder bereik. Activiteiten zónder coördinaten kunnen niet geplaatst worden; die houden
hun onderlinge volgorde en gaan achteraan, en de melding noemt hoeveel het er zijn.

## Stijl

- Inline style-objecten, kleuren uit `COLORS` in `lib/data.js`. Geen CSS-framework
  toevoegen.
- Fonts (Fraunces + DM Sans) komen via `@import` in `globals.css`.
- Nederlandse UI-teksten en commentaar, mobiel-eerst (de app wordt op de telefoon
  gebruikt, vaak met slecht bereik).
