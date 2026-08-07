# Routekaart

Wat er nog komt en in welke volgorde. Afgeronde stappen staan onderaan, zodat de
aanleiding van een keuze terug te vinden blijft.

De werkafspraak staat in CLAUDE.md: elke stap gaat pas naar `main` als `npm test`
en `npx next build` allebei slagen, en pushen naar `main` betekent live deployen.

## Nog te doen

Niets vastgelegd. De veertien punten van de eerste twee rondes staan er alle veertien.

Ideeën die langskwamen maar bewust zijn blijven liggen, met de reden erbij:

- **Samenvoegen bij een botsing.** De versiecontrole (afgerond punt 5) laat je kiezen
  tussen twee volledige versies. Vinken twee mensen elk een ánder item af, dan is dat
  kiezen jammer. Echt samenvoegen vraagt een datamodel per veld in plaats van per
  document, en dat raakt alle schrijvende pagina's. De moeite waard zodra het in de
  praktijk knelt — niet eerder.
- **Een volledige offline-app met service worker.** Punt 7 doet offline *lezen* op een
  manier die de valkuil-19-bugs vermijdt (zichtbaar gedateerd, opslaan uit). Offline
  kunnen *bewerken* is iets heel anders: dan heb je een wachtrij en een
  samenvoegstrategie nodig, en zit je meteen aan het punt hierboven vast.
- **Echte rijroutes tussen verblijven in het logboek.** De lijn op de kaart is nu een
  rechte tussen de punten. Een echte route vraagt een ORS-aanroep per traject en levert
  voor een terugblik weinig extra's op.
- **`next/image`.** Wordt nergens gebruikt; zodra dat verandert moet de aanname bij
  valkuil 17 (sharp is niet bereikbaar) opnieuw worden nagelopen.

## Openstaand bij de eigenaar

- **`BEHEER_WACHTWOORD` instellen** in Vercel (Settings → Environment Variables →
  Production) en één keer redeployen. Tot die tijd werkt alles, maar valt `/beheer`
  terug op alleen de familie-PIN — en dan kan iedereen die de PIN kent ook terugzetten
  en wissen.
- Optioneel: `CRON_SECRET`, zodat `/api/backup/run` alleen nog Vercel's eigen aanroep
  accepteert. Met de familie-PIN erbij is dat netjes, niet noodzakelijk.

## Afgerond

**Ronde 1 — fundament.** De dingen die stuk konden gaan terwijl het gezin de app
tijdens de vakantie gebruikt.

| | Wat | Waarom het erop stond |
| --- | --- | --- |
| 1 | Automatische reservekopieën naar Vercel Blob, met terugzetpad | Er was geen enkele kopie; één misklik was alles kwijt |
| 2 | `xlsx` eruit, Next bijgewerkt naar 15.5.23 | Kwetsbaarheden zonder fix; de import hoefde alleen kolommen te lezen |
| 3 | Testsuite op `node --test`, samen met de build de poort | Elke wijziging was tot dan toe handwerk-verificatie |
| 4 | Foutenlogboek (`/fouten`), browser én server | Een storing bleef onzichtbaar tot iemand het meldde |
| 5 | Botsingen tussen twee bewerkers zichtbaar maken | Twee telefoons tegelijk = het werk van één verdween zonder melding |
| 6 | `Planner.jsx` opgesplitst naar `components/planner/` | 4.152 regels in één bestand; elke wijziging raakte alles |
| 7 | Antwoorden van externe diensten bewaren in Redis | Overpass en Nominatim weigeren op het verkeerde moment |

**Ronde 2 — functies erbij.**

| | Wat | Waarom het erop stond |
| --- | --- | --- |
| 1 | Beheerderspagina (`/beheer`) met eigen wachtwoord, en één poort voor alle pagina's | `PinGate` zat alleen in `Planner.jsx`, dus `/reservekopie` was onbereikbaar vanuit de geïnstalleerde app. En de familie-PIN gaf ook toegang tot terugzetten |
| 2 | Terugblik (`/verslag`): nachten, landen, cijfers per reis | Het logboek wist het al; het stond alleen nergens bij elkaar |
| 3 | Alleen-lezen meekijk-link (`/bekijk`) | Opa en oma laten meekijken zonder de PIN weg te geven |
| 4 | Uitgaven (`/uitgaven`) met verrekening | Bijhouden wat een reis kost, en wie wie moet terugbetalen |
| 5 | Inpaklijst per persoon | De lijst was gedeeld; nu kan iedereen zijn eigen spullen zien |
| 6 | Weer bij elke dag, via Open-Meteo | Een activiteit verschuiven als het regent |
| 7 | Offline lezen zonder service worker | Slecht bereik op de camping, zonder de "waarom zie ik oude data"-bugs |
