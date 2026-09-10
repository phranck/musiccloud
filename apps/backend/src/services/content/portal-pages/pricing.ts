/**
 * @file The copy the /pricing page was created with.
 *
 * A TypeScript module rather than a Markdown file, because the backend ships as
 * one CommonJS bundle and a file beside the source would not be in it. Editing
 * this changes what a portal without the page gets when it first starts, and
 * nothing else: once the page exists, the dashboard is what it says.
 */

/** The Markdown the /pricing page starts with. */
export const PRICING_PAGE_CONTENT = `musiccloud's API is **free while we build it out**, and it won't stay free forever. Running it has real costs, and paid plans for high-volume and commercial use are planned. Here is what you can count on.

## Our commitment

[[cards columns=2 {
[[card {
:::fields layout=stacked
The free plan stays free.: Paid plans will add capacity. They won't take away what you have today.
Early users are grandfathered.: If you're here before pricing launches, your free allowance is locked in.
:::
}]]

[[card {
:::fields layout=stacked
Plenty of notice.: At least 30 days before anything changes. No surprises, no rug-pulls.
No artificial friction.: We won't degrade the free experience to push you to pay.
:::
}]]
}]]

[[plans]]
`;
