import { useEffect, useRef } from "react";
import { buildGenreQuery, GENRE_SEARCH_PARAM } from "@/lib/resolve/genre-query";

/**
 * Runs a genre search when the homepage is loaded with `?genre=<name>`.
 *
 * Genre links on pages without their own in-page search flow (e.g. a persistent
 * share page) point at the homepage with this parameter set. On mount the
 * homepage reads it once, mirrors the corresponding genre query into the hero
 * input, submits it so the genre results render, and strips the parameter from
 * the URL so a reload won't re-trigger the search. A ref guard keeps it to a
 * single run even though `handleSubmit` changes with the resolve mode.
 *
 * @param handleSubmit - App-state submit handler that runs the resolve query.
 * @param setInputValue - Setter mirroring the active query into the hero input.
 */
export function useGenreSearchParam(
  handleSubmit: (query: string) => Promise<void>,
  setInputValue: (value: string) => void,
): void {
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const name = new URLSearchParams(window.location.search).get(GENRE_SEARCH_PARAM);
    if (!name) return;
    handled.current = true;
    const query = buildGenreQuery(name);
    setInputValue(query);
    void handleSubmit(query);
    const url = new URL(window.location.href);
    url.searchParams.delete(GENRE_SEARCH_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [handleSubmit, setInputValue]);
}
