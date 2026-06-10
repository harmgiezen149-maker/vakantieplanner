# Vakantieplanner — Gedeelde familie-planner

Een generieke, herbruikbare vakantieplanner voor het hele gezin. Stel per vakantie de reisperiode en je verblijven (camping, AirBnB, hotel…) in, en de app bouwt automatisch de dagen op — inclusief aankomstdag, wisseldagen tussen verblijven en de vertrekdag. Iedereen plant via dezelfde URL activiteiten per dag, voegt eigen ideeën toe, en alles wordt direct op de server bewaard.

Gebouwd met **Next.js 15** + **Upstash Redis** voor Vercel deployment.

## Belangrijkste features

- ⚙️ **Reis instellen**: titel, periode (van/tot) en één of meer verblijven met eigen datums en locatie (wereldwijde locatiezoeker via OpenStreetMap)
- 📅 Dagen worden automatisch opgebouwd uit periode + verblijven, met wisseldagen en kleur per verblijf
- 🗺️ Kaartweergave (Leaflet) met verblijf-markers, activiteit-markers, filter per verblijf of per dag, en dagroutes met afstand/rijtijd
- 🎯 Kleine set generieke startactiviteiten (zwemmen, wandelen, markt, BBQ…) + onbeperkt eigen activiteiten met locatie
- ✅ Auto & documenten-checklist en 🎒 inpaklijst — beide gedeeld, met **"Alle vinkjes resetten"** zodat je lijsten herbruikt bij de volgende vakantie
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

### 5. (Optioneel) OpenRouteService voor routes

De kaart toont per dag een route met afstand en rijtijd. Standaard gebruikt de app de publieke OSRM-server (geen key nodig, fair-use). Voor nauwkeurigere en stabielere routeberekening:

1. Maak een gratis key aan op [openrouteservice.org](https://openrouteservice.org/dev/#/signup)
2. Voeg in Vercel toe: `ORS_API_KEY` = `jouw-key`

### 6. Redeploy

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
- **Migratie vanaf de oude Vogezen-2026 versie**: bij de eerste lees-actie valt de app automatisch terug op de oude keys (`vosges:family-plan`, `vogezen2026:checklist`, `vogezen2026:inpakken`), zodat bestaande data behouden blijft. Bij de eerste schrijf-actie wordt alles onder de nieuwe keys opgeslagen.
- Dagen worden **niet** opgeslagen maar telkens afgeleid uit `tripConfig` — periode of verblijven wijzigen werkt dus direct door, en geplande activiteiten op datums binnen de nieuwe periode blijven staan.
- API routes:
  - `GET /api/plan` — haalt huidige staat op
  - `PUT /api/plan` — overschrijft de hele staat (incl. tripConfig)
  - `GET/POST /api/checklist` en `/api/inpakken` — gedeelde lijsten
  - `GET /api/geocode?q=…` — wereldwijde locatiezoeker (Nominatim, rate-limited)
  - `POST /api/route` — dagroute via ORS of OSRM
- Sync: wijzigingen worden 500 ms na de laatste actie naar de server gestuurd. Bij window-focus wordt automatisch opnieuw opgehaald.
- Conflictresolutie: last-write-wins. Voor een gezin is dat prima.

## Bestandsstructuur

```
vakantieplanner/
├── app/
│   ├── api/
│   │   ├── plan/route.js       # GET + PUT: tripConfig + planning
│   │   ├── checklist/route.js  # Gedeelde checklist
│   │   ├── inpakken/route.js   # Gedeelde inpaklijst
│   │   ├── geocode/route.js    # Locatiezoeker (Nominatim)
│   │   └── route/route.js      # Routeberekening (ORS/OSRM)
│   ├── checklist/page.jsx
│   ├── inpakken/page.jsx
│   ├── kaart/page.jsx
│   ├── layout.jsx              # Root layout met fonts
│   ├── page.jsx                # Server-rendered home page
│   └── globals.css             # Reset + Google Fonts
├── components/
│   ├── Planner.jsx             # Hoofdplanner incl. "Reis instellen"
│   ├── MapView.jsx             # Leaflet-kaart
│   ├── Checklist.jsx           # Auto & documenten
│   └── PackingList.jsx         # Inpaklijst
├── lib/
│   ├── data.js                 # tripConfig-logica, buildDays, categorieën
│   ├── redis.js                # Upstash Redis client wrapper
│   └── useRoute.js             # Route-fetch helper
├── jsconfig.json               # @/ path alias
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

## Licentie

MIT — doe ermee wat je wilt.
