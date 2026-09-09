import type { CatalogEntry } from "./catalog.ts";
const entry = (
  en: string,
  fr: string,
  hi: string,
  es: string,
  ar: string,
  zh: string,
): CatalogEntry => Object.freeze({ en, fr, hi, es, ar, zh });
export const SHORTCUT_CATALOG: Readonly<Record<string, CatalogEntry>> =
  Object.freeze({
    SHORTCUT: entry(
      "SHORTCUT",
      "RACCOURCI",
      "शॉर्टकट",
      "ATAJO",
      "طريق مختصر",
      "捷径",
    ),
    "NARROW APEX": entry(
      "NARROW APEX",
      "CORDE ÉTROITE",
      "संकरा मोड़",
      "VÉRTICE ESTRECHO",
      "منعطف ضيق",
      "窄弯控线",
    ),
    "LINK THE TURNS": entry(
      "LINK THE TURNS",
      "ENCHAÎNEZ LES VIRAGES",
      "मोड़ों को जोड़ें",
      "ENLAZA LAS CURVAS",
      "اربط المنعطفات",
      "连续变向",
    ),
    "EARLY TURN-IN": entry(
      "EARLY TURN-IN",
      "ANTICIPEZ LE VIRAGE",
      "जल्दी मोड़ें",
      "GIRA CON ANTELACIÓN",
      "انعطف مبكرًا",
      "提前入弯",
    ),
    "STRAIGHTEN TO BOOST": entry(
      "STRAIGHTEN TO BOOST",
      "REDRESSEZ PUIS ACCÉLÉREZ",
      "सीधा करके बूस्ट करें",
      "ENDEREZA Y ACELERA",
      "استقم ثم تسارع",
      "拉正后加速",
    ),
    "HOLD YOUR LINE": entry(
      "HOLD YOUR LINE",
      "GARDEZ LA TRAJECTOIRE",
      "अपनी लाइन बनाए रखें",
      "MANTÉN LA TRAZADA",
      "حافظ على مسارك",
      "稳住走线",
    ),
  });
