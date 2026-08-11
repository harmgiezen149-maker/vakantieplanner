# Vakantieplanner — Gedeelde familie-planner

Een generieke, herbruikbare vakantieplanner voor het hele gezin. Stel per vakantie de reisperiode en je verblijven (camping, AirBnB, hotel…) in, en de app bouwt automatisch de dagen op — inclusief aankomstdag, wisseldagen tussen verblijven en de vertrekdag. Iedereen plant via dezelfde URL activiteiten per dag, voegt eigen ideeën toe, en alles wordt direct op de server bewaard.

Gebouwd met **Next.js 15** + **Upstash Redis** voor Vercel deployment.

## Belangrijkste features

- ⚙️ **Reis instellen**: titel, periode (van/tot) en één of meer verblijven met eigen datums en locatie (wereldwijde locatiezoeker via OpenStreetMap)
- 📅 Dagen worden automatisch opgebouwd uit periode + verblijven, met wisseldagen en kleur per verblijf
- 🗺️ Kaartweergave (Leaflet) met verblijf-markers, activiteit-markers, filter per verblijf of per dag, en dagroutes met afstand/rijtijd
- 🎯 Kleine set generieke startactiviteiten (zwemmen, wandelen, markt, BBQ…) + onbeperkt eigen activiteiten met locatie
- ✅ Auto & documenten-checklist en 🎒 inpaklijst — beide gedeeld, met **"Alle vinkjes resetten"** zodat je lijsten herbruikt bij de volgende vakantie
- 👤 **Inpaklijst per persoon**: vul in wie er meegaan en wijs spullen aan iemand toe. Filter op persoon, of geef iedereen zijn eigen lijst via `/inpakken?persoon=Naam`. Items zonder naam gaan voor iedereen mee en blijven overal zichtbaar
- 🔎 **Foutenlogboek** (`/fouten`): gaat er in de app iets mis — in de browser van wie hem gebruikt of op de server — dan komt dat hier terecht, met een teller per fout. Zo zie je een storing zonder dat iemand het hoeft te melden
- 🛟 **Automatische reservekopieën** (`/reservekopie`): elke nacht wordt alles naar Vercel Blob weggeschreven — 30 dagen aan dagelijkse kopieën plus één per maand tot een jaar terug. Je kunt er een terugzetten (de huidige staat wordt dan eerst veiliggesteld) of alles als JSON downloaden
- ⭐ **Verblijvenlogboek** (`/verblijven`): alle plekken waar je hebt gelogeerd op één kaart, met bezoekdatum, soort verblijf (camping met tent/caravan/camper/stacaravan, hotel, B&B, Airbnb of anders), foto's, korte review, een cijfer van 1 tot 10 en desgewenst de website. Het land wordt automatisch uit de locatie afgeleid. Zoeken kan op land, soort en minimumcijfer — de kaart filtert mee. Je haalt de huidige reis met één knop binnen, en oude vakanties voeg je met de hand toe
- ✅ **Bezocht bijhouden**: vink aan wat je werkelijk hebt gedaan — op een dag in de planning, in het dagoverzicht, of rechtstreeks in de activiteitenlijst (dan vraagt de app even op welke dag het was). Bij het verblijf zie je daarna een lijstje van wat je in die buurt hebt bezocht — ook nog jaren later, want het wordt als momentopname bewaard en overleeft "nieuwe vakantie starten"
- 📍 **Wat is hier in de buurt?**: sta je ergens en wil je het vastleggen? Eén knop zoekt op je huidige locatie naar plekken binnen 3 km, en zet er met één tik een activiteit van — meteen als bezocht aangevinkt en op de dag van vandaag gezet
- 📊 **Terugblik** (`/verslag`): hoeveel reizen, nachten en landen, het gemiddelde cijfer, de verdeling over de jaren en per reis het hoogst beoordeelde verblijf. Volledig afgeleid uit het verblijvenlogboek — je hoeft er niets extra's voor in te vullen
- 📴 **Offline lezen**: geen bereik op de camping? Dan zie je de laatst geladen versie, met een balk erboven die vertelt van wanneer die is. Wijzigingen worden dan niet bewaard — zo overschrijf je nooit per ongeluk het werk van een ander met verouderde gegevens
- 🌦️ **Weer bij elke dag**: verwachting per dag bij je verblijf, in het dagoverzicht en klein op elke dagkaart in de planner. Via Open-Meteo — geen account of sleutel nodig. Ligt de dienst eruit, dan staat er gewoon niets
- 💶 **Uitgaven** (`/uitgaven`): wat de reis kost, per categorie en per persoon. Vul in wie er meedoen en de app rekent uit wie aan het eind wie moet terugbetalen. Bedragen worden in hele centen bewaard, dus er raakt niets kwijt in afrondingen
- 🔗 **Meekijk-link**: maak onder Beheer een link waarmee anderen (opa en oma) de planning kunnen bekijken zonder de familie-PIN en zonder iets te kunnen wijzigen. Het verblijvenlogboek, de foto's, de inpaklijst en de namen van wie wat bijwerkte gaan niet mee. Eén link tegelijk, en intrekken werkt meteen
- 🆕 **Update-melding**: draait er een nieuwere versie op de server dan die je open hebt staan, dan verschijnt onderin een balk met een herlaadknop. Hij herlaadt nooit uit zichzelf — je verliest anders waar je middenin zat
- 🔄 **"Nieuwe vakantie starten"**: wist planning en reisgegevens, maar laat checklist- en inpaklijst-items staan
- 👨‍👩‍👧‍👦 Server-side opslag: iedereen ziet dezelfde planning ("Laatst bijgewerkt door…")
- 🔒 Optionele familie-PIN voor toegangsbeperking
- 📱 Mobiel-first: tap-based interactie, bottom sheets, geen drag-and-drop
- 🌿 Eigen ontwerp met topografische achtergrond, Fraunces + DM Sans

## Eerste keer opzetten (~10 minuten)

### 1. Push naar GitHub

```bash
cd vakantieplanner
git init
git add .
git commit -m "Initial commit"
# Maak een repo op github.com, dan:
git remote add origin git@github.com:JOUWUSER/vakantieplanner.git
git branch -M main
git push -u origin main
```

### 2. Importeer naar Vercel

1. Ga naar [vercel.com/new](https://vercel.com/new)
2. Klik "Import Git Repository" en kies je `vakantieplanner` repo
3. Klik **Deploy** (eerste deploy faalt waarschijnlijk omdat Redis nog niet bestaat — dat is OK)

### 3. Voeg Upstash Redis toe (gratis tier)

1. In je Vercel project: ga naar het **Storage** tabblad
2. Klik **Create Database** → kies **Redis** (powered by Upstash)
3. Kies een naam (bv. `vakantieplanner-db`) en regio (Frankfurt is dichtbij)
4. Klik **Create** → Vercel maakt de database aan en koppelt hem automatisch
5. De omgevingsvariabelen `UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN` worden automatisch ingesteld

De gratis tier van Upstash Redis is meer dan voldoende voor familie-gebruik (10.000 requests/dag).

### 4. (Optioneel) Familie-PIN instellen

Wil je dat alleen het gezin de planner kan zien? Voeg een PIN toe:

1. In je Vercel project: **Settings** → **Environment Variables**
2. Voeg toe: `FAMILY_PIN` = `jullie-geheim-getal` (bv. `7825`)
3. Sla op

Zonder deze variabele is de URL gewoon publiek (URL is dan de "geheime" toegangssleutel).

**Voer de PIN één keer in per apparaat.** Elke pagina vraagt er zelf om als hij nog
niet bekend is, dus ook als je bijvoorbeeld rechtstreeks `/beheer` opent.

### 4b. (Aanbevolen) Beheerderswachtwoord

De familie-PIN geeft toegang tot de planner. Daarnaast is er een tweede slot voor de
dingen die je maar één keer verkeerd hoeft te doen: een reservekopie terugzetten (dat
overschrijft alles), alles downloaden, en het foutenlogboek wissen.

1. **Settings** → **Environment Variables**
2. Voeg toe: `BEHEER_WACHTWOORD` = `een-tweede-geheim`
3. Redeploy

Zonder deze variabele valt `/beheer` terug op alleen de familie-PIN — er breekt dus
niets als je hem (nog) niet zet.

### 5. (Aanbevolen) Geoapify voor omgevingssuggesties

De "Ontdek de omgeving"-knop zoekt bezienswaardigheden, zwemplekken en
supermarkten rond je verblijven. Zonder key valt de app terug op de gratis
publieke OpenStreetMap-servers (Overpass), maar die weigeren Vercel's
gedeelde IP-adressen regelmatig. Met een gratis Geoapify-key werkt het
betrouwbaar:

1. Maak een gratis account op [geoapify.com](https://www.geoapify.com/) (3000 aanvragen/dag)
2. Maak in hun dashboard een project aan en kopieer de API key
3. Voeg in Vercel toe: `GEOAPIFY_API_KEY` = `jouw-key`
4. Redeploy

Zoekresultaten worden bewaard: dezelfde omgeving een tweede keer opvragen
gaat niet opnieuw naar buiten, maar komt uit de opslag. Dat scheelt wachten,
en een omgeving die je eerder bekeek blijft werken op een dag dat de
OpenStreetMap-servers niet meewerken. Een omgeving die je nog nooit hebt
opgevraagd kan dan nog steeds mislukken — dat is niet weg te nemen.

### 6. (Optioneel) OpenRouteService voor routes

De kaart toont per dag een route met afstand en rijtijd. Standaard gebruikt de app de publieke OSRM-server (geen key nodig, fair-use). Voor nauwkeurigere en stabielere routeberekening:

1. Maak een gratis key aan op [openrouteservice.org](https://openrouteservice.org/dev/#/signup)
2. Voeg in Vercel toe: `ORS_API_KEY` = `jouw-key`

**Deze sleutel bepaalt ook of "Slimme volgorde" écht te voet kan rekenen.** Liggen de
activiteiten van een dag binnen twee kilometer van elkaar, dan behandelt de app het als
een stadsbezoek en zoekt hij de kortste *wandelroute* — door parken, over bruggetjes en
door het voetgangersgebied. Daar is een wandelrouter voor nodig, en de publieke
OSRM-server kent alleen auto. Zónder sleutel rekent de wandelmodus hemelsbreed: voor een
compact centrum meestal dezelfde volgorde, maar niet altijd. De melding onder de knop
zegt welke van de twee het was.

### 7. (Optioneel) Vercel Blob voor foto's bij verblijven

Het verblijvenlogboek kan foto's per verblijf bewaren. Die gaan niet in Redis — dat is voor kleine JSON-documenten — maar in Vercel Blob:

1. Ga in je Vercel-project naar **Storage** → **Create Database** → **Blob**
2. Koppel de store aan dit project

`BLOB_READ_WRITE_TOKEN` wordt daarna automatisch gezet. Sla je deze stap over, dan werkt de hele pagina gewoon; alleen het uploaden van een foto geeft dan een nette foutmelding.

> **Let op:** de foto's krijgen een publiek leesbare (maar onraadbare) URL. Wie de link heeft, kan de foto zien — ook zonder de familie-PIN. Voor vakantiekiekjes is dat meestal prima; zet er geen dingen in die echt privé moeten blijven.

### 8. Redeploy

1. Ga naar **Deployments** → klik op de laatste deploy → **Redeploy**
2. Wacht ~1 minuut → klaar!

Je krijgt een URL als `https://vakantieplanner-XXX.vercel.app`. Deel deze met het gezin.

## Een nieuwe vakantie beginnen

1. Open de planner → instellingen (knop rechtsonder) → **Nieuwe vakantie starten**
2. De planning, eigen activiteiten en reisgegevens worden gewist; checklist-items en inpaklijst-items blijven staan
3. Stel de nieuwe titel, periode en verblijven in via **Reis instellen**
4. Op de checklist- en inpakpagina: tik **"↺ Alle vinkjes resetten"** — alles staat weer op "te doen", zonder dat je je lijsten opnieuw hoeft op te bouwen

## Lokaal ontwikkelen

```bash
npm install

# Pull env vars uit je Vercel project naar lokaal:
npx vercel link
npx vercel env pull .env.development.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Hoe werkt het qua data?

- Redis-key `planner:trip` bevat één JSON-object met:
  - `tripConfig`: `{ title, startDate, endDate, stays: [{ id, name, startDate, endDate, coords, locationLabel }] }`
  - `plan`: `{ '2026-07-25': ['g_arrival', ...], ... }` (datum → activiteit-id's)
  - `customActivities`: lijst van zelf toegevoegde activiteiten
  - `locationOverrides`: aangepaste locaties voor standaard-activiteiten
  - `updatedAt` + `updatedBy` voor de "laatst bijgewerkt" indicator
- Checklist en inpaklijst hebben eigen keys: `planner:checklist` en `planner:inpakken`
- Het verblijvenlogboek staat onder `planner:verblijven`, **bewust apart van `planner:trip`**: dat document wordt gewist bij "Nieuwe vakantie starten", en het logboek moet die reset juist overleven. Foto's staan niet in Redis maar in Vercel Blob; per foto bewaart het logboek alleen de URL
- **Migratie vanaf de oude Vogezen-2026 versie**: bij de eerste lees-actie valt de app automatisch terug op de oude keys (`vosges:family-plan`, `vogezen2026:checklist`, `vogezen2026:inpakken`), zodat bestaande data behouden blijft. Bij de eerste schrijf-actie wordt alles onder de nieuwe keys opgeslagen.
- Dagen worden **niet** opgeslagen maar telkens afgeleid uit `tripConfig` — periode of verblijven wijzigen werkt dus direct door, en geplande activiteiten op datums binnen de nieuwe periode blijven staan.
- API routes:
  - `GET /api/plan` — haalt huidige staat op
  - `PUT /api/plan` — overschrijft de hele staat (incl. tripConfig)
  - `GET/POST /api/checklist` en `/api/inpakken` — gedeelde lijsten
  - `GET/POST /api/verblijven` — het verblijvenlogboek
  - `GET/POST/DELETE /api/fouten` — foutenlogboek lezen, melden en wissen
  - `GET/POST /api/backup` — reservekopieën opvragen en maken
  - `GET /api/backup/download` — alles als JSON downloaden (werkt ook zonder Blob)
  - `POST /api/backup/restore` — een momentopname terugzetten
  - `POST /api/verblijven/upload` — geeft een uploadtoken af voor Vercel Blob
  - `DELETE /api/verblijven/foto` — verwijdert een foto uit Blob
  - `GET /api/geocode?q=…` — wereldwijde locatiezoeker (Nominatim, rate-limited)
  - `GET /api/geocode?lat=…&lng=…` — coördinaten → land (voor het verblijvenlogboek)
  - `POST /api/route` — dagroute via ORS of OSRM
- Sync: wijzigingen worden 500 ms na de laatste actie naar de server gestuurd. Bij window-focus wordt automatisch opnieuw opgehaald.
- Bewerken jullie tegelijk? Dan verdwijnt er niets stilzwijgend meer. Wie als tweede
  opslaat krijgt een melding — "Anna heeft intussen iets opgeslagen" — met twee knoppen:
  *Hun versie laden* (jouw laatste wijziging vervalt) of *Toch de mijne opslaan* (die van
  hen wordt overschreven). Samenvoegen doet de app niet; je kiest er één.

## Bestandsstructuur

```
vakantieplanner/
├── app/
│   ├── api/
│   │   ├── plan/route.js          # GET + PUT: tripConfig + planning
│   │   ├── checklist/route.js     # Gedeelde checklist
│   │   ├── inpakken/route.js      # Gedeelde inpaklijst
│   │   ├── verblijven/route.js    # Verblijvenlogboek
│   │   ├── verblijven/upload/     # Uploadtoken voor Vercel Blob
│   │   ├── verblijven/foto/       # Foto verwijderen uit Blob
│   │   ├── geocode/route.js       # Locatiezoeker (Nominatim)
│   │   ├── resolve-maps/route.js  # Google Maps-link → naam + coördinaten
│   │   ├── suggest/route.js       # Omgevingssuggesties (Geoapify/Overpass)
│   │   ├── hiking/route.js        # Wandelroutes uit OpenStreetMap
│   │   ├── whats-here/route.js    # POI's rond een kaartklik
│   │   └── route/route.js         # Routeberekening (ORS/OSRM)
│   ├── checklist/page.jsx
│   ├── dag/page.jsx
│   ├── inpakken/page.jsx
│   ├── kaart/page.jsx
│   ├── verblijven/page.jsx
│   ├── layout.jsx                 # Root layout met fonts + PWA-metadata
│   ├── manifest.js                # Web App Manifest
│   ├── page.jsx                   # Server-rendered home page
│   └── globals.css                # Reset + Google Fonts
├── components/
│   ├── Planner.jsx                # Hoofdplanner incl. "Reis instellen"
│   ├── MapView.jsx                # Leaflet-kaart
│   ├── DayOverview.jsx            # Dag-voor-dag met route en GPX
│   ├── StayLog.jsx                # Verblijvenlogboek
│   ├── LocationPicker.jsx         # Gedeeld locatieveld (adres/Maps-link)
│   ├── Checklist.jsx              # Auto & documenten
│   └── PackingList.jsx            # Inpaklijst
├── lib/
│   ├── data.js                    # tripConfig-logica, buildDays, categorieën
│   ├── maps.js                    # Maps-links, coördinaten, PIN-helper
│   ├── stayLog.js                 # Client-kant van het verblijvenlogboek
│   ├── stayTypes.js               # Soorten verblijf + landhulpjes (ook server-side)
│   ├── redis.js                   # Upstash Redis client wrapper
│   └── useRoute.js                # Route-fetch helper
├── CLAUDE.md                      # Architectuur en valkuilen
├── jsconfig.json                  # @/ path alias
├── next.config.mjs
├── package.json
└── .env.example
```

## Aanpassen aan eigen smaak

- **Startactiviteiten**: bewerk `lib/data.js` (constant `DEFAULT_ACTIVITIES`) — dit zijn bewust generieke, locatieloze items; specifieke uitjes voeg je in de app zelf toe
- **Categorieën**: zelfde bestand, `CATEGORIES`
- **Verblijfkleuren**: zelfde bestand, `STAY_PALETTE`
- **Kleuren/stijl**: zelfde bestand, `COLORS`

Na lokale aanpassing → `git commit` + `git push` → Vercel deployt automatisch.

## Tip voor het gezin

Bij eerste bezoek: vul je naam in (achter het persoontje 👤). Dan zien anderen wie wat heeft gewijzigd via de "Laatst bijgewerkt door…" indicator.

**In de app zit een handleiding.** Onder **Uitleg** in het menu (of op `/uitleg`) staat in
zeventien punten wat de app allemaal kan, met nagebouwde voorbeelden en een knop naar het
echte scherm bij elk punt. Handig om door te sturen naar wie nieuw is — al heeft die dan
wel de familie-PIN nodig.

## Licentie

MIT — doe ermee wat je wilt.
