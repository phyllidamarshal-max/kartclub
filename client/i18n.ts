import {
  CATALOG,
  SOURCE_KEYS,
  type CatalogLanguage,
} from "./locales/catalog.ts";
import {
  BRAND_OVERRIDES,
  LEGACY_ENGLISH_SOURCES,
  STRUCTURAL_CATALOG,
  withoutLegacyBrand,
} from "./locales/brand.ts";

export type Language = "en" | "fr" | "hi" | "es" | "ar" | "zh";

export const LANGUAGES: readonly {
  code: Language;
  label: string;
  dir: "ltr" | "rtl";
}[] = Object.freeze([
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "French", dir: "ltr" },
  { code: "hi", label: "Hindi", dir: "ltr" },
  { code: "es", label: "Spanish", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "zh", label: "Chinese", dir: "ltr" },
]);

const LANGUAGE_CODES = new Set<Language>(LANGUAGES.map(({ code }) => code));
const STORAGE_KEY = "kart-language";
const DEFAULT_LANGUAGE: Language = "en";

function validLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_CODES.has(value as Language);
}

function storedLanguage(): Language {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return validLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

let activeLanguage: Language = storedLanguage();

function applyDocumentMetadata(code: Language) {
  try {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    root.lang = code;
    root.dir = LANGUAGES.find((item) => item.code === code)?.dir ?? "ltr";
  } catch {
    // Browser globals can be absent or access-restricted in tests and embedded views.
  }
}

applyDocumentMetadata(activeLanguage);

export function language(): Language {
  return activeLanguage;
}

export function setLanguage(code: string): void {
  activeLanguage = validLanguage(code) ? code : DEFAULT_LANGUAGE;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, activeLanguage);
  } catch {
    // The selected language still applies for this session when storage is blocked.
  }
  applyDocumentMetadata(activeLanguage);
}

function interpolate(
  source: string,
  values: Record<string, string | number>,
): string {
  return source.replace(/\{([a-z][a-z0-9]*)\}/gi, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : token,
  );
}

function localizedValues(
  values: Record<string, string | number>,
  locale: Language,
): Record<string, string | number> {
  let result = values;
  for (const [name, value] of Object.entries(values)) {
    if (
      name === "name" ||
      name === "id" ||
      typeof value !== "string" ||
      !CATALOG[value]
    )
      continue;
    if (result === values) result = { ...values };
    result[name] = CATALOG[value][locale];
  }
  return result;
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Pattern = {
  source: string;
  names: string[];
  expression: RegExp;
};

const PATTERNS: readonly Pattern[] = SOURCE_KEYS.filter((source) =>
  source.includes("{"),
)
  .sort(
    (a, b) =>
      b.replace(/\{[^}]+\}/g, "").length - a.replace(/\{[^}]+\}/g, "").length,
  )
  .map((source) => {
    const names: string[] = [];
    let offset = 0;
    let expression = "^";
    for (const match of source.matchAll(/\{([a-z][a-z0-9]*)\}/gi)) {
      expression += escapeRegExp(source.slice(offset, match.index));
      expression += "(.+?)";
      names.push(match[1]);
      offset = match.index + match[0].length;
    }
    expression += escapeRegExp(source.slice(offset)) + "$";
    return { source, names, expression: new RegExp(expression, "u") };
  });

const ENGLISH_SOURCES = new Map<string, string>();
for (const source of SOURCE_KEYS) {
  const english = BRAND_OVERRIDES[source]?.en ?? CATALOG[source].en;
  ENGLISH_SOURCES.set(english, source);
  ENGLISH_SOURCES.set(CATALOG[source].en, source);
}
for (const [english, source] of Object.entries(LEGACY_ENGLISH_SOURCES))
  ENGLISH_SOURCES.set(english, source);

function matchPattern(
  value: string,
): { source: string; values: Record<string, string> } | null {
  for (const pattern of PATTERNS) {
    const match = pattern.expression.exec(value);
    if (!match) continue;
    const values: Record<string, string> = {};
    pattern.names.forEach((name, index) => {
      values[name] = match[index + 1];
    });
    return { source: pattern.source, values };
  }
  return null;
}

export function tr(
  source: string,
  values: Record<string, string | number> = {},
  locale: Language = activeLanguage,
): string {
  const selected = validLanguage(locale) ? locale : DEFAULT_LANGUAGE;
  const structural = STRUCTURAL_CATALOG[source];
  if (structural)
    return interpolate(
      withoutLegacyBrand(structural[selected as CatalogLanguage]),
      values,
    );
  const canonicalSource = ENGLISH_SOURCES.get(source) ?? source;
  if (canonicalSource === "{n} 圈" && Number(values.n) === 1)
    return CATALOG["1 圈"][selected as CatalogLanguage];
  const exact = CATALOG[canonicalSource];
  if (exact)
    return interpolate(
      withoutLegacyBrand(
        BRAND_OVERRIDES[canonicalSource]?.[selected as CatalogLanguage] ??
          exact[selected as CatalogLanguage],
      ),
      localizedValues(values, selected),
    );

  const matched = matchPattern(canonicalSource);
  if (matched) {
    return interpolate(
      withoutLegacyBrand(
        BRAND_OVERRIDES[matched.source]?.[selected as CatalogLanguage] ??
          CATALOG[matched.source][selected as CatalogLanguage],
      ),
      localizedValues({ ...matched.values, ...values }, selected),
    );
  }
  return interpolate(withoutLegacyBrand(canonicalSource), values);
}

type RenderState = { source: string; rendered: string };
const textState = new WeakMap<object, RenderState>();
const attributeState = new WeakMap<object, Map<string, RenderState>>();
const DISPLAY_ATTRIBUTES = ["placeholder", "aria-label", "title"] as const;
const SKIPPED_ELEMENTS = new Set(["SCRIPT", "STYLE"]);
const FORM_TEXT_ELEMENTS = new Set(["INPUT", "TEXTAREA"]);

function translatedText(value: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
  if (!match || !match[2]) return value;
  return match[1] + tr(match[2]) + match[3];
}

function renderText(node: { textContent: string | null }) {
  const current = node.textContent ?? "";
  const prior = textState.get(node as object);
  const source = prior && current === prior.rendered ? prior.source : current;
  const rendered = translatedText(source);
  if (rendered !== current) node.textContent = rendered;
  textState.set(node as object, { source, rendered });
}

function renderAttributes(node: {
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
}) {
  if (!node.getAttribute || !node.setAttribute) return;
  let states = attributeState.get(node as object);
  if (!states) {
    states = new Map();
    attributeState.set(node as object, states);
  }
  for (const name of DISPLAY_ATTRIBUTES) {
    const current = node.getAttribute(name);
    if (current === null) continue;
    const prior = states.get(name);
    const source = prior && current === prior.rendered ? prior.source : current;
    const rendered = translatedText(source);
    if (rendered !== current) node.setAttribute(name, rendered);
    states.set(name, { source, rendered });
  }
}

type DomLikeNode = {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<DomLikeNode>;
  tagName?: string;
  hasAttribute?: (name: string) => boolean;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
};

function visit(node: DomLikeNode, blocked: boolean) {
  if (node.nodeType === 3) {
    if (!blocked) renderText(node);
    return;
  }
  if (node.nodeType !== 1) return;

  const tag = (node.tagName ?? "").toUpperCase();
  const skip =
    blocked ||
    SKIPPED_ELEMENTS.has(tag) ||
    node.hasAttribute?.("data-no-i18n") === true;
  if (!skip) renderAttributes(node);
  for (const child of Array.from(node.childNodes))
    visit(child, skip || FORM_TEXT_ELEMENTS.has(tag));
}

export function localize(root: HTMLElement): void {
  if (!root || typeof root !== "object") return;
  visit(root as unknown as DomLikeNode, false);
}
