# Six-language localization report

Status: **DONE**

## Files

- `client/i18n.ts` — runtime language state, persistence, document language/direction, translation/interpolation, exact dynamic-pattern matching, and safe in-place DOM localization.
- `client/locales/catalog.ts` — maintainable source-key catalog with 384 entries in English, French, Hindi, Spanish, Arabic, and Chinese.
- `tests/i18n.test.ts` — focused contract, coverage, interpolation, runtime-safety, switching, and DOM behavior tests.
- `docs/ui-refresh/i18n-report.md` — this handoff report.

No package, server, shared gameplay, `client/main.ts`, CSS, or 3D source files were edited by this task.

## Public API

`client/i18n.ts` implements the requested interface exactly:

```ts
export type Language = "en" | "fr" | "hi" | "es" | "ar" | "zh";
export const LANGUAGES: readonly {
  code: Language;
  label: string;
  dir: "ltr" | "rtl";
}[];
export function language(): Language;
export function setLanguage(code: string): void;
export function tr(
  source: string,
  values?: Record<string, string | number>,
  locale?: Language,
): string;
export function localize(root: HTMLElement): void;
```

Chinese is the default. Valid choices persist under `kart-language`. Storage and DOM access are guarded, so importing and calling the module without `window`, `document`, or storage is safe. `setLanguage` updates `document.documentElement.lang` and `dir`; Arabic is `rtl`, and all other supported languages are `ltr`. Invalid choices fall back to Chinese.

`tr` supports named interpolation and fully anchored dynamic source-pattern matching. It never treats translated text as HTML. Player names and identifiers remain literal, while known nested content such as item, track, and mode names can be translated inside dynamic patterns.

`localize` updates existing text nodes and `placeholder`, `aria-label`, and `title` attributes through text APIs. It keeps node identity and event handlers, retains whitespace, remembers the Chinese source across repeated language changes, and treats externally refreshed text as a new source. It skips `script`, `style`, form-entered values, and complete `[data-no-i18n]` subtrees. Select-option labels remain translatable.

## Coverage

The 384-entry catalog has complete six-locale parity and placeholder parity. It includes:

- Every new phrase and dynamic pattern listed in `docs/ui-refresh/i18n-brief.md`, including the width alias `{width} 米路宽` used by the integrated UI and the kart name `浪潮 · MK I`.
- All exported track and route names, nine challenge names and full descriptions, race modes, AI difficulty labels, item names, and six training hints.
- Lobby, career, multiplayer, room/readiness, settings, controls, help, pause, loading, results, HUD, connection, reward-vault, and simulated-economy copy found in the existing client.
- Dynamic lap, rank, width, distance, energy, nitro, tutorial, reset, collision, objective, result, item, room, and classic-history messages.
- Client network notices, Chinese room/auth/audit errors, and English economy errors that can reach toast/result UI. Dynamic account IDs are preserved.

Brand and protocol values such as KART CLUB, PONS, TICKET, room/account IDs, user nicknames, key names, numbers, and timing values are intentionally preserved.

There are no known missing catalog entries in the required source/data inventory. Composite runtime sentences must still be assembled with `tr` at their semantic boundaries; arbitrary substring translation is deliberately unsupported because it can corrupt names and sentence grammar. In particular, the HUD objective should use `tr(q.description)` plus the cataloged `当前集气 {drift}/{target}；道具 {uses}/{itemTarget}` pattern rather than localizing the concatenated result as one unknown sentence.

## Verification

Test development followed red-green cycles for the missing module, catalog/attribute coverage, nested item-name translation, select-option labels, English economy errors, dynamic track summaries, and the integrated `{width}`/kart-name keys.

| Command | Result |
| --- | --- |
| `npx tsx --test tests/i18n.test.ts` | PASS — 10 tests, 0 failures |
| `npx prettier --check client/i18n.ts client/locales/catalog.ts tests/i18n.test.ts` | PASS |
| `npm run build` | PASS — TypeScript and Vite production build completed; existing bundle-size warning remains |
| `npm test` | PASS — 136 tests, 0 failures |

Browser and visual RTL checks were explicitly assigned to the main integration task and were not run here.

## Integration notes

After changing a selector, call `setLanguage(code)`, rerender markup that already uses `tr`, then call `localize(app)` on the resulting screen. Call `localize` again after HUD or room text updates. Use complete catalog phrases or `tr(pattern, values)` for dynamic copy. Mark nicknames, room/account IDs, and other user-controlled text with `data-no-i18n` (and `dir="auto"` where useful).

## Integration update — 2026-09-08

The integrated catalog now has 385 entries. Root integration added dynamic-pattern specificity, a result-use count and form-attribute handling without changing entered values. Focused localization coverage is now 12 tests; final full suite is 140/140. Six-language HUD/settings and English lobby/career/online/vault/help browser checks were performed by the integration task. See verification.md for limitations and design QA.

