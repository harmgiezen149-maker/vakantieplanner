# Routekaart

Wat er nog op de lijst staat, in de volgorde waarin we het oppakken. Afgeronde
stappen staan onderaan, zodat de aanleiding van een keuze terug te vinden blijft.

De werkafspraak staat in CLAUDE.md: elke stap gaat pas naar `main` als `npm test`
en `npx next build` allebei slagen, en pushen naar `main` betekent live deployen.

## Nog te doen

### 1. Beheerderspagina met eigen toegang

**Aanleiding.** De familie-PIN staat sinds 7 augustus 2026 aan, en toen bleek waar
het wringt: `/reservekopie` werkt wel in de browser maar niet in de geïnstalleerde
app. Dat is geen PWA-probleem. De `PinGate` staat **alleen in `components/Planner.jsx`**,
dus alleen het beginscherm kan om een PIN vragen. Elke andere pagina leest hem via
`getPin()` uit `localStorage` en gaat ervan uit dat hij er al staat. Is dat niet zo —
een nieuw apparaat, de geïnstalleerde app naast de browser — dan krijg je een pagina
die niets laadt en geen manier om alsnog in te loggen.

**Wat het wordt.** Eén beheerderspagina waar de dingen onder vallen die niet bij het
dagelijks plannen horen, bereikbaar via een eigen knop en achter een eigen wachtwoord:

- reservekopieën (nu `/reservekopie`)
- het foutenlogboek (nu `/fouten`)
- "nieuwe vakantie starten" en "hele planning wissen" (nu in de instellingen-sheet)
- ruimte voor instellingen die er later bij komen

**Twee dingen om bij het bouwen goed te doen:**

- **De PIN-vraag moet uit `Planner.jsx` weg** naar iets dat elke pagina kan gebruiken.
  Zolang alleen het beginscherm ernaar kan vragen, verplaatst dit probleem zich alleen
  maar naar de volgende pagina.
- **Beheerderswachtwoord ≠ familie-PIN.** De PIN is er zodat het gezin erbij kan; het
  beheerderswachtwoord is er zodat niet iedereen die erbij kan óók een oude
  momentopname over de huidige planning kan zetten. Aparte env var, en de
  serverroutes moeten die controle zelf doen — een knop verbergen in de UI is geen
  beveiliging.

### 2. Reisverslag en statistieken (B4)

Uit het verblijvenlogboek een terugblik samenstellen: hoeveel nachten, welke landen,
gemiddeld cijfer per soort verblijf, de route over de jaren.

### 3. Alleen-lezen deel-link (C4)

Een link waarmee opa en oma de planning kunnen bekijken zonder iets te kunnen wijzigen.

### 4. Uitgaven bijhouden (B1)

Per dag of per activiteit een bedrag, met een totaal per reis.

### 5. Inpaklijst per persoon (B2)

Nu is de lijst gedeeld; iedereen zou een eigen kolom of filter moeten kunnen hebben.

### 6. Weer bij het dagoverzicht (B3)

Verwachting per dag bij het verblijf, zodat je een activiteit kunt verschuiven.

### 7. Offline kunnen lezen (C1)

Let op: dit botst met valkuil 19 in CLAUDE.md (bewust géén service worker). Gecachete
JS naast een gedeeld Redis-document geeft precies de "waarom zie ik oude data"-bugs
die de sync-vangnetten proberen te vermijden. Eerst bespreken, dan pas bouwen.

## Openstaand bij de eigenaar

- Niets meer. Vercel Blob is gekoppeld, de eerste reservekopie staat erin en de
  familie-PIN is ingesteld.
- Optioneel: `CRON_SECRET` instellen, zodat `/api/backup/run` alleen nog Vercel's
  eigen aanroep accepteert. Met de familie-PIN erbij is dat netjes, niet noodzakelijk.

## Afgerond

| | Wat | Waarom het erop stond |
| --- | --- | --- |
| 1 | Automatische reservekopieën naar Vercel Blob, met terugzetpad | Er was geen enkele kopie; één misklik was alles kwijt |
| 2 | `xlsx` eruit, Next bijgewerkt naar 15.5.23 | Kwetsbaarheden zonder fix; de import hoefde alleen kolommen te lezen |
| 3 | Testsuite op `node --test`, samen met de build de poort | Elke wijziging was tot dan toe handwerk-verificatie |
| 4 | Foutenlogboek (`/fouten`), browser én server | Een storing bleef onzichtbaar tot iemand het meldde |
| 5 | Botsingen tussen twee bewerkers zichtbaar maken | Twee telefoons tegelijk = het werk van één verdween zonder melding |
| 6 | `Planner.jsx` opgesplitst naar `components/planner/` | 4.152 regels in één bestand; elke wijziging raakte alles |
| 7 | Antwoorden van externe diensten bewaren in Redis | Overpass en Nominatim weigeren op het verkeerde moment |
