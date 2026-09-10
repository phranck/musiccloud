/**
 * @file The copy the /docs landing page was created with.
 *
 * A TypeScript module rather than a Markdown file, because the backend ships as
 * one CommonJS bundle and a file beside the source would not be in it. Editing
 * this changes what a portal without the page gets when it first starts, and
 * nothing else: once the page exists, the dashboard is what it says.
 */

/** The Markdown the /docs landing page starts with. */
export const DOCS_PAGE_CONTENT = `The musiccloud API turns a single music link into every platform. Resolve a track or album from one streaming service to its matches across the others, pull rich artist info, and explore a free-to-use Creative Commons catalogue. All of it runs over one REST API.

[[card {
## What you can build

One key gives you three capabilities, each a JSON REST endpoint:

:::fields
Link resolve: Match a track, album, or artist from one streaming service to the same release everywhere else.
Artist info: Top tracks, similar artists, and upcoming events for any matched artist.
Creative Commons: Search and resolve the free-to-use Jamendo catalogue for tracks you can use openly.
:::
}]]

[[card {
## How it fits together

Four things, each one inside the one before it. Knowing which is which tells you where your quota is counted and what you can switch off without taking everything else down with it.

:::fields
Account: You. An email address and a password, or a GitHub sign-in. Nothing is counted against it. One account may hold {projectsPerAccount} projects.
Project: One application of yours. It carries the plan, and it is where your requests are counted, so everything under it shares one budget.
Registration: One place that application runs: your server, the copy on a phone, your own machine while you build. Each gets its own credentials and can be revoked on its own, without touching the others. A project may hold {registrationsPerProject} of them.
Key: What you send with a request. It belongs to one registration, is shown once, and can be rotated so the old and the new one overlap while you deploy.
:::

So a plan belongs to an application rather than to you, and a key belongs to one place that application runs in.
}]]

[[card {
## Getting started

Four steps take you from zero to your first call.

1. **Create a developer account.** Sign up with your email or GitHub to get a developer account on the portal.
2. **Create a project.** A project holds your plan and the quota that every registration under it shares.
3. **Register your app and issue its key.** Register the app under your project, then issue its key. A key is shown once, when it is created or rotated.
4. **Call the API.** Send your key in the request header and start resolving links and fetching artist info.
}]]

[[card {
## Trying it without a key

\`GET /api/v1/resolve\` answers without any credential, on a budget of its own that no other operation shares: {keylessRequestsPerMinute} requests a minute and {keylessRequestsPerDay} a day, counted per address. That is enough to see what the API returns before you sign up, and not enough to build on.
}]]
`;
