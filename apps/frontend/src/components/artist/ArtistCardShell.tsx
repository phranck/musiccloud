/**
 * Desktop artist-column card shell.
 *
 * Thin alias of the shared {@link SectionCardShell}: the four desktop artist
 * cards keep importing `ArtistCardShell` while the chrome lives in one place.
 * The artist cards never animate and rely on the shell's default full-width
 * outer class, so the alias needs no extra wiring.
 */
export { SectionCardShell as ArtistCardShell } from "@/components/cards/SectionCardShell";
