# Woeler CMS

AI-beheer voor WaaS 2.0-sites op WoelerWaaS. Marketeers en klanten vragen in gewone taal om een aanpassing. Het systeem voert alleen uit wat het thema via ACF-velden kan.

## Wat het wel doet

- Tekst in een bestaand blok aanpassen
- Een blok toevoegen dat op die site echt bestaat, gekozen uit een preview
- SEO-titel, meta-omschrijving en focuswoord zetten
- Per pagina laten zien of er één H1 is, of er meer H1's staan, welke H2's er zijn, en of het zoekwoord terugkomt
- Een concept-case of concept-blog maken, en die op verzoek publiceren

## Wat het niet doet

- CSS, stylesheets, padding of lettergrootte
- Een pagina, het menu of de site verwijderen
- API-gegevens tonen aan iemand die geen beheerder is

Blokken komen uit het themaschema van de site (`OPTIONS /wp/v2/pages`). Een layout die daar niet in staat, kan niet gekozen worden. Dezelfde afspraken staan in het CMS onder Instellingen.

## Rollen

- Beheerder: klanten toevoegen en uit dit systeem halen, API-gegevens zien, gebruikers aanmaken
- Marketeer en klant: alleen de gekoppelde sites, en alleen de acties hierboven

Een klant uit dit systeem halen laat de WordPress-site staan.

## Lokaal

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://127.0.0.1:43123

Eerste start maakt drie gebruikers:

- mara@woeler.nl / Woeler-admin-2026
- marketeer@woeler.nl / Woeler-markt-2026
- klant@woeler.nl / Woeler-klant-2026

Zet `WOELER_WP_APP_PASSWORD` in `.env.local` om Woeler bij de eerste start te koppelen. Wijzig de wachtwoorden daarna.
