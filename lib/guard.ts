export type GuardResult =
  | { allowed: true }
  | { allowed: false; message: string };

const CSS =
  /\bcss\b|stylesheet|<style|style\s*=|custom css|extra css|\bpadding\b|\bmargin\b|font-size|lettergrootte/i;

const SITE =
  /\b(verwijder|wis|delete|gooi|haal)\b[\s\S]{0,40}\b(de site|de website|hele site|hele website|deze site)\b|\b(site|website)\b[\s\S]{0,24}\b(verwijderen|weggooien|offline|uit de lucht)\b|\bdelete (the )?(site|website)\b/i;

const PAGE =
  /\b(verwijder|wis|delete|gooi)\b[\s\S]{0,40}\b(de hele pagina|deze pagina|alle pagina|de pagina|pagina's|paginas)\b|\bpagina verwijderen\b|\bdelete (the |this )?page\b|\bhaal de pagina (offline|weg)\b|\b(de pagina|deze pagina) in de prullenbak\b/i;

const MENU =
  /\b(menu|hoofdmenu|navigatie|menu-item|menuitem)\b/i;

const BLOCK =
  /\b(verwijder|haal weg|gooi weg)\b[\s\S]{0,30}\b(het blok|de hero|de sectie|alle blokken)\b/i;

const SECRET =
  /\b(api-?key|api-?sleutel|applicatiewachtwoord|application password)\b/i;

export function guardPrompt(prompt: string): GuardResult {
  const text = prompt.trim();
  if (SECRET.test(text)) {
    return {
      allowed: false,
      message:
        "API-gegevens vraag je niet via een prompt. Die ziet alleen een beheerder, op de klantkaart.",
    };
  }
  if (CSS.test(text)) {
    return {
      allowed: false,
      message:
        "CSS gebruik ik niet. Aanpassingen lopen via de blokken en velden van het WaaS 2.0-thema.",
    };
  }
  if (SITE.test(text)) {
    return {
      allowed: false,
      message: "De site verwijderen doe ik niet. Dat prompt voer ik niet uit.",
    };
  }
  if (MENU.test(text)) {
    return {
      allowed: false,
      message: "Het menu aanpassen of verwijderen doe ik niet.",
    };
  }
  if (PAGE.test(text) && !/\b(woord|zin|alinea|kop|tekst)\b/i.test(text)) {
    return {
      allowed: false,
      message: "Een pagina verwijderen doe ik niet. De tekst op een pagina aanpassen kan wel.",
    };
  }
  if (BLOCK.test(text) && !/\b(kop|tekst|titel|woord|zin)\b/i.test(text)) {
    return {
      allowed: false,
      message: "Een blok weghalen doe ik niet. De tekst in dat blok kan ik wel aanpassen.",
    };
  }
  if (/\b(alles verwijderen|hele inhoud weg|leeg de site|drop de database)\b/i.test(text)) {
    return {
      allowed: false,
      message: "Inhoud of de site wissen doe ik niet.",
    };
  }
  return { allowed: true };
}
