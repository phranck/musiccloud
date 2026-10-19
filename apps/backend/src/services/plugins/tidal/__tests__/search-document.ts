/** A JSON:API fixture resource may deliberately contain invalid metadata for boundary tests. */
export interface TidalFixtureResource {
  id: string;
  type?: string;
  [field: string]: unknown;
}

/**
 * Builds the current search envelope without confusing primary resources with hits.
 *
 * Ranked relationship identifiers and included resource bodies are separate.
 * Additional included metadata is preserved unless the explicit result replaces
 * the same type/id pair. This keeps track, album, and artist fixtures on one
 * transport contract while allowing tests to corrupt individual fields.
 *
 * @param kind - Ranked relationship being exercised.
 * @param resources - Search hits in provider ranking order.
 * @param included - Related metadata, whose array order does not determine rank.
 * @returns One search-results resource and the referenced included resources.
 */
export function tidalSearchDocument(
  kind: "tracks" | "albums" | "artists",
  resources: readonly TidalFixtureResource[],
  included: readonly TidalFixtureResource[] = [],
) {
  return {
    data: [
      {
        type: "searchResults",
        id: "fixture-search-results",
        relationships: {
          [kind]: { data: resources.map((resource) => ({ type: kind, id: resource.id })) },
        },
      },
    ],
    included: [
      ...included.filter((entry) => !resources.some((resource) => entry.type === kind && entry.id === resource.id)),
      ...resources.map((resource) => ({ ...resource, type: kind })),
    ],
  };
}
