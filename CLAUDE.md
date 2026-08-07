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
reservekopieën in `backup.js`, het uitlezen van Maps-links in `maps.js`, het samenvoegen van
meldingen in `errorLog.js`, de versiecontrole in `conflict.js`, de cachesleutels in
`geoCache.js`, de CSV-import en de opschoning in `stayValidation.js`.

Twee dingen om te weten als je tests toevoegt:

- **Alleen pure logica.** Componenten en API-routes worden niet getest; die controleer je in
  de browser tegen een Redis-stub. Wil je iets uit een component testbaar maken, haal het
  dan eerst naar `lib/` — zo zijn `packing.js` en `stayValidation.js` ontstaan.
- **`lib/`-modules importeren elkaar relatief** (`./data.js`), niet via `@/lib/…`. De
  padalias is van Next; plain Node kent hem niet en de tests draaien buiten Next om. De build slaagt zonder Redis-env-vars (je ziet dan alleen
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
  dag/page.jsx            → DayOverview    (dag-voor-dag, met autoroute + GPX)
  inpakken/page.jsx       → PackingList
  checklist/page.jsx      → Checklist
  verblijven/page.jsx     → StayLog        (logboek: kaart, cijfer, review, foto's)
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
    fouten/     GET/POST/DELETE  foutenlogboek (melden mag zonder PIN)
    backup/     GET/POST  reservekopieën: lijst / nieuwe maken
    backup/run/ GET       adres van de dagelijkse Vercel-cron
    backup/download/      alles als JSON downloaden (werkt zonder Blob)
    backup/restore/ POST  momentopname terugzetten
    verblijven/ GET/POST  verblijvenlogboek
    verblijven/upload/    uploadtoken voor Vercel Blob
    verblijven/foto/      foto verwijderen uit Blob (DELETE)
components/   Planner.jsx (planscherm), MapView.jsx, DayOverview.jsx,
              PackingList.jsx, Checklist.jsx, StayLog.jsx, LocationPicker.jsx,
              ConflictMelding.jsx (botsingsbalk), Foutmelder.jsx
  planner/    de sheets van het planscherm — zie hieronder
lib/          data.js (palet, categorieën, buildDays, overrides), maps.js
              (Maps-links + PIN), stayLog.js, stayTypes.js, backup.js, csv.js,
              conflict.js, errorLog.js, geoCache.js, packing.js,
              stayValidation.js, redis.js, useRoute.js
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

Vijf losse Redis-documenten, elk één JSON-blob:

| Key | Vorm |
| --- | --- |
| `planner:trip` | `{ plan, customActivities, locationOverrides, tripConfig, suggestExclusions, updatedAt, updatedBy }` |
| `planner:inpakken` | `{ categories:[{id,name}], items:[{id,categoryId,label,qty,checked,packed,important,note}], updatedBy, updatedAt }` |
| `planner:checklist` | `{ checked:{}, updatedBy, updatedAt }` |
| `planner:verblijven` | `{ stays:[{id,name,locationLabel,coords,type,typeOther,country,countryCode,startDate,endDate,periodLabel,tripTitle,score,review,photos,source}], updatedBy, updatedAt }` |
| `planner:fouten` | `{ fouten:[{bron,bericht,detail,pad,versie,aantal,eerst,laatst}], updatedAt }` — max 100 |

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
`whats-here/` en `geocode/` gaan onder `cache:v1:<naam>:<sleutel>` in Redis. Twee keer
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
Staat `FAMILY_PIN` niet ingesteld, dan is alles open. Staat hij wel, dan verwacht elke
route `X-Family-Pin` (de client haalt hem uit `localStorage['planner-pin']`). Nieuwe API
routes: neem die check over, anders is dat een gat.

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

**14. Reizen zijn afgeleid, niet opgeslagen.**
`groepeerReizen()` in `lib/stayLog.js` plakt verblijven aan elkaar die in de tijd tegen
elkaar aan liggen (gat ≤ `MAX_GAT_DAGEN`, nu 5), met `tripTitle` als bovenliggende regel:
twee verschillende gearchiveerde reizen worden nooit samengevoegd, ook niet als ze op
elkaar aansluiten. Er staat dus **geen reis-id in het datamodel** — pas je de datums van
een verblijf aan, dan verschuift de groepering vanzelf. Groeperen gebeurt op de hele
lijst en niet op de gefilterde: anders hakt een filter een reis in stukken. De route op de
kaart is een rechte lijn tussen de verblijven in datumvolgorde, geen echte rijroute.

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

## Stijl

- Inline style-objecten, kleuren uit `COLORS` in `lib/data.js`. Geen CSS-framework
  toevoegen.
- Fonts (Fraunces + DM Sans) komen via `@import` in `globals.css`.
- Nederlandse UI-teksten en commentaar, mobiel-eerst (de app wordt op de telefoon
  gebruikt, vaak met slecht bereik).
