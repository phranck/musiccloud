/**
 * @file What the developer portal opens with.
 *
 * The page is edited in the dashboard like any other, so this is not where it
 * is read from. It is where it starts: the copy the page is created with, so a
 * new deployment has a home page before anybody has written one, and so the
 * shape of the released example key is somewhere a test can see it.
 *
 * A `.ts` module rather than a `.md` file, because the backend ships as one
 * CommonJS bundle and reads nothing beside it at runtime.
 */

/** Where the page is published in the portal. */
export const PORTAL_HOME_PATH = "/";

/** The slug the page is stored under. */
export const PORTAL_HOME_SLUG = "home";

/** The title, which the portal renders as the page's own heading. */
export const PORTAL_HOME_TITLE = "Build with the musiccloud API";

/** The copy the page is created with. */
export const PORTAL_HOME_CONTENT = `Resolve any music link, fetch artist info, and explore Creative Commons tracks. One REST API, one key.

[[hstack spacing=12 {
[[button:/signup label="Get an API key" icon="key"]]

[[button:/docs label="Read the docs" icon="book-open" tone="neutral"]]
}]]

\`\`\`bash
# Resolve a Spotify link to every platform
curl https://api.musiccloud.io/api/v1/resolve \\
  -H "X-API-Key: mc_live_example12345_replace_with_your_secret_value" -d '{"url":"…"}'
\`\`\`

[[cards columns=3 {
[[card {
[[icon name="link-simple" size=28 text="## Link resolve"]]

One link in, every platform out.
}]]

[[card {
[[icon name="user-circle" size=28 text="## Artist info"]]

Top tracks, similar artists, events.
}]]

[[card {
[[icon name="disc" size=28 text="## Creative Commons"]]

Free-to-use catalogue access.
}]]
}]]
`;
