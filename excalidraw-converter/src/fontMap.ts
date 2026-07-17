/**
 * Maps Excalidraw's numeric `fontFamily` enum to a CSS `font-family` stack.
 *
 * Real enum values from the installed `@excalidraw/excalidraw@0.18.1` package
 * (verified via `node_modules/@excalidraw/excalidraw/dist/prod/chunk-K2UTITRG.js`
 * and `dist/types/excalidraw/constants.d.ts`'s `FONT_FAMILY` export):
 *
 *   Virgil: 1, Helvetica: 2, Cascadia: 3, Excalifont: 5, Nunito: 6,
 *   "Lilita One": 7, "Comic Shanns": 8, "Liberation Sans": 9
 *
 * Note this is NOT the naive 1/2/3 = Virgil/Helvetica/Cascadia the spec text
 * guesses at as an exhaustive list — Excalidraw has more families than that,
 * and real content in this repo uses `fontFamily: 5` (Excalifont) throughout.
 * Excalifont is Virgil's modern replacement (same hand-drawn look, Virgil is
 * its old/internal name) so both 1 and 5 map to the same CSS stack here.
 *
 * Unrecognized values fall back to the Excalifont stack rather than throwing
 * — font resolution is a rendering concern, not a validation concern, so an
 * unknown enum value should never abort a conversion.
 */

const EXCALIFONT_STACK = '"Excalifont", "Virgil", cursive';
const HELVETICA_STACK = "Helvetica, Arial, sans-serif";
const CASCADIA_STACK = '"Cascadia Code", monospace';
const NUNITO_STACK = '"Nunito", sans-serif';
const LILITA_STACK = '"Lilita One", cursive';
const COMIC_SHANNS_STACK = '"Comic Shanns", monospace';
const LIBERATION_SANS_STACK = '"Liberation Sans", Arial, sans-serif';

/** Excalidraw's numeric fontFamily enum -> CSS font-family stack. */
const FONT_FAMILY_MAP: Record<number, string> = {
  1: EXCALIFONT_STACK, // Virgil (legacy name for Excalifont)
  2: HELVETICA_STACK, // Helvetica
  3: CASCADIA_STACK, // Cascadia
  5: EXCALIFONT_STACK, // Excalifont
  6: NUNITO_STACK, // Nunito
  7: LILITA_STACK, // "Lilita One"
  8: COMIC_SHANNS_STACK, // "Comic Shanns"
  9: LIBERATION_SANS_STACK, // "Liberation Sans"
};

/**
 * Resolve an Excalidraw numeric fontFamily value to a CSS font-family stack.
 * Never throws — unrecognized values fall back to the Excalifont stack,
 * since this repo's hand-drawn aesthetic is the safest default look.
 */
export function resolveFontFamily(fontFamily: number | undefined | null): string {
  if (fontFamily == null) return EXCALIFONT_STACK;
  return FONT_FAMILY_MAP[fontFamily] ?? EXCALIFONT_STACK;
}
