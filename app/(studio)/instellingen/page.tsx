const GROUPS = [
  {
    title: "Wat wel kan",
    items: [
      "Tekst in een bestaand blok aanpassen, zoals een kop of een alinea.",
      "Een blok toevoegen dat op die site in het thema staat. De blokken komen van de site zelf, met een voorbeeld, zodat je geen layout kiest die er niet is.",
      "SEO-titel, meta-beschrijving en focuswoord zetten. Per pagina controleer ik of er precies één H1 is, welke H2's er staan, en of het focuswoord in de SEO-titel, de meta, de H1, een H2 en de tekst voorkomt.",
      "Een case of blog aanmaken als concept. Publiceer zet alleen dat concept live.",
      "Staat er al een H1 op de pagina, dan krijgt een nieuwe hero een H2.",
    ],
  },
  {
    title: "Wat niet kan",
    items: [
      "CSS, een stylesheet, padding, marge of lettergrootte. Aanpassingen lopen via de velden van het WaaS 2.0-thema.",
      "Een pagina, het menu of de site verwijderen.",
      "Een blok weghalen. De tekst in dat blok aanpassen kan wel.",
      "De inhoud van een site wissen.",
      "API-gegevens opvragen in een prompt.",
    ],
  },
  {
    title: "Wie wat ziet",
    items: [
      "Een beheerder ziet alle klanten, de API-gegevens, en kan klanten en gebruikers toevoegen of weghalen.",
      "Een marketeer ziet alleen de klanten die een beheerder aan die persoon heeft gekoppeld, zonder API-gegevens.",
      "Een klant ziet alleen de eigen site, zonder API-gegevens.",
      "Een klant uit dit CMS halen laat de WordPress-site staan.",
    ],
  },
];

export default function SettingsPage() {
  return (
    <main className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          Instellingen
        </h1>
        <p className="mt-2 text-sm text-[#585858]">
          Dit houdt het CMS aan bij elke prompt, voor iedereen, ook voor een beheerder.
        </p>
      </div>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            {group.title}
          </h2>
          <ul className="mt-3 space-y-2">
            {group.items.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3 text-sm text-[#061122] ring-1 ring-[#e4e4e4]">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
