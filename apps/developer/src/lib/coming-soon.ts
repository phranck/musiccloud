/**
 * @file Self-contained Developer Portal availability pages.
 *
 * Served by `src/middleware.ts` when the persisted portal state is closed or
 * in maintenance. Its only same-origin dependency is the public runtime theme.
 *
 * Styling mirrors `src/styles/global.css` (the night-mode tokens) and the
 * `Wordmark` component, so the maintenance page looks like the live portal.
 */

/**
 * The availability pages ship full SEO metadata (description,
 * canonical, Open Graph, Twitter card) so shared links render a rich preview
 * and the page is indexable. The `og:image` is hosted on the frontend origin
 * (`musiccloud.io/img`) because this service seals its own asset routes behind
 * the maintenance gate. Umami tracks visits under the developer-portal website id.
 */
export const PortalGateMode = {
  ComingSoon: "comingSoon",
  Maintenance: "maintenance",
} as const;

export type PortalGateMode = (typeof PortalGateMode)[keyof typeof PortalGateMode];

interface PortalGateCopy {
  description: string;
  heading: string;
  metaTitle: string;
  statusLabel: string;
}

const GATE_COPY: Record<PortalGateMode, PortalGateCopy> = {
  [PortalGateMode.ComingSoon]: {
    metaTitle: "musiccloud for developers · coming soon",
    description:
      "Public API access and developer tools for musiccloud are on the way. Build music-sharing experiences on the musiccloud platform.",
    heading: "coming soon",
    statusLabel: "System status",
  },
  [PortalGateMode.Maintenance]: {
    metaTitle: "musiccloud for developers · maintenance",
    description:
      "The musiccloud Developer Portal is temporarily unavailable for maintenance. The API reference remains available.",
    heading: "maintenance",
    statusLabel: "System status",
  },
};

/** Renders the common availability page for the requested portal state. */
export function renderPortalGateHtml(mode: PortalGateMode): string {
  const copy = GATE_COPY[mode];
  const bodyCopy =
    mode === PortalGateMode.Maintenance
      ? "The Developer Portal is temporarily closed for maintenance. The API reference remains available while we complete this work."
      : "Public API access and developer tools for musiccloud are on the way. We are putting the finishing touches on the platform and will open the doors shortly.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${copy.metaTitle}</title>
    <meta
      name="description"
      content="${copy.description}"
    />
    <link rel="canonical" href="https://developer.musiccloud.io/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="musiccloud" />
    <meta property="og:title" content="${copy.metaTitle}" />
    <meta
      property="og:description"
      content="${copy.description}"
    />
    <meta property="og:url" content="https://developer.musiccloud.io/" />
    <meta property="og:image" content="https://musiccloud.io/img/developer-og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="musiccloud / developer" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${copy.metaTitle}" />
    <meta
      name="twitter:description"
      content="${copy.description}"
    />
    <meta name="twitter:image" content="https://musiccloud.io/img/developer-og.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="/developer-theme.css" />
    <link
      href="https://fonts.googleapis.com/css2?family=Audiowide&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <!-- Umami analytics (developer portal). -->
    <script
      defer
      src="https://umami.layered.work/script.js"
      data-website-id="bb2ed9b3-7601-499e-97fa-c3c98a86a67b"
    ></script>
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        height: 100%;
        margin: 0;
      }

      body {
        min-height: 100vh;
        font-family: var(--mc-font-sans);
        color: var(--mc-color-fg);
        background: linear-gradient(180deg, var(--mc-color-sky-top) 0%, var(--mc-color-sky-bottom) 100%);
        background-image:
          radial-gradient(
            120% 55% at 50% -8%,
            color-mix(in srgb, var(--mc-color-accent), transparent 86%) 0%,
            transparent 60%
          ),
          linear-gradient(180deg, var(--mc-color-sky-top) 0%, var(--mc-color-sky-bottom) 100%);
        background-attachment: fixed;
        display: flex;
        flex-direction: column;
        -webkit-font-smoothing: antialiased;
      }

      .shell {
        --maintenance-title-size: 5.5rem;
        --maintenance-copy-size: 1.25rem;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--mc-space-page-top) var(--mc-space-page-inline);
        gap: var(--mc-space-8);
      }

      .text-gradient {
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .wordmark {
        display: inline-flex;
        align-items: baseline;
        gap: var(--mc-space-2);
        font-size: var(--mc-text-section);
        line-height: 1;
        animation: rise var(--mc-motion-duration-entrance) var(--mc-motion-easing-emphasized) both;
      }

      .wordmark .brand {
        font-family: var(--mc-font-logo);
        font-weight: 400;
        background-image: var(--mc-gradient-logo-rainbow);
      }

      .wordmark .suffix {
        font-family: var(--mc-font-condensed);
      }

      .wordmark .suffix .slash {
        color: var(--mc-color-fg);
        font-weight: 600;
      }

      .wordmark .suffix .word {
        font-weight: 400;
        background-image: var(--mc-gradient-logo-suffix);
      }

      .rule {
        width: min(13.75rem, 45vw);
        height: 2px;
        border-radius: 2px;
        background-image: var(--mc-gradient-logo-rainbow);
        opacity: 0.9;
        animation: rise var(--mc-motion-duration-entrance) var(--mc-motion-easing-emphasized) 50ms both;
      }

      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--mc-space-4);
        animation: rise var(--mc-motion-duration-entrance) var(--mc-motion-easing-emphasized) 120ms both;
      }

      .hero h1 {
        margin: 0;
        font-family: var(--mc-font-condensed);
        font-weight: 600;
        font-size: var(--maintenance-title-size);
        line-height: 0.95;
        letter-spacing: 0.01em;
      }

      .hero p {
        margin: 0;
        max-width: 34rem;
        font-size: var(--maintenance-copy-size);
        line-height: 1.55;
        color: var(--mc-color-fg-muted);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--mc-space-3);
        justify-content: center;
        animation: rise var(--mc-motion-duration-entrance) var(--mc-motion-easing-emphasized) 200ms both;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: var(--mc-space-2);
        min-height: var(--mc-size-control);
        padding: var(--mc-space-2) var(--mc-space-5);
        border-radius: var(--mc-radius-control);
        font-family: var(--mc-font-condensed);
        font-weight: 500;
        font-size: 1.05rem;
        letter-spacing: 0.01em;
        border: 1px solid var(--mc-color-border);
        background: var(--mc-color-surface);
        color: var(--mc-color-fg);
        text-decoration: none;
        transition:
          border-color var(--mc-motion-duration-normal) var(--mc-motion-easing-standard),
          background var(--mc-motion-duration-normal) var(--mc-motion-easing-standard),
          transform var(--mc-motion-duration-normal) var(--mc-motion-easing-standard);
      }

      .btn:hover {
        border-color: var(--mc-color-border-strong);
        background: color-mix(in srgb, var(--mc-color-fg) 7%, transparent);
        transform: translateY(-1px);
      }

      .btn.primary {
        border-color: color-mix(in srgb, var(--mc-color-accent), transparent 45%);
        background: color-mix(in srgb, var(--mc-color-accent), transparent 82%);
        color: var(--mc-color-accent-hover);
      }

      .btn.primary:hover {
        border-color: var(--mc-color-accent);
        background: color-mix(in srgb, var(--mc-color-accent), transparent 72%);
      }

      .dot {
        width: var(--mc-space-2);
        height: var(--mc-space-2);
        border-radius: 50%;
        background: var(--mc-color-success);
        box-shadow: 0 0 10px 1px color-mix(in srgb, var(--mc-color-success), transparent 40%);
      }

      footer {
        padding: var(--mc-space-6);
        text-align: center;
        color: var(--mc-color-fg-subtle);
        font-size: 0.9rem;
      }

      footer a {
        color: var(--mc-color-fg-muted);
        text-decoration: none;
      }

      footer a:hover {
        color: var(--mc-color-fg);
        background: var(--mc-color-surface);
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
        }
      }

      @media (max-width: 40rem) {
        .shell {
          --maintenance-title-size: 2.75rem;
          --maintenance-copy-size: 1.05rem;
        }

        .wordmark {
          font-size: var(--mc-text-card-title);
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="wordmark">
        <span class="text-gradient brand">musiccloud</span>
        <span class="suffix"><span class="slash">/</span> <span class="text-gradient word">developer</span></span>
      </div>

      <div class="rule"></div>

      <div class="hero">
        <h1>${copy.heading}</h1>
        <p>${bodyCopy}</p>
      </div>

      <div class="actions">
        <a class="btn primary" href="/docs/api">View API reference</a>
        <a class="btn" href="https://status.musiccloud.io"><span class="dot"></span> ${copy.statusLabel}</a>
        <a class="btn" href="https://musiccloud.io">Back to musiccloud</a>
      </div>
    </main>

    <footer>&copy; 2026 musiccloud. Built for people who love music.</footer>
  </body>
</html>
`;
}
