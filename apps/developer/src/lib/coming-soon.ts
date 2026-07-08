/**
 * @file The developer-portal "coming soon" maintenance page, as a single
 * self-contained HTML string.
 *
 * Served by `src/middleware.ts` for EVERY request while the `COMING_SOON`
 * environment flag is on, so the unfinished portal is fully sealed off in
 * production. It is deliberately self-contained (inline CSS, fonts from the
 * Google Fonts CDN, no same-origin assets) so the middleware can answer every
 * route, including asset and API paths, without leaking any real portal page.
 *
 * Styling mirrors `src/styles/global.css` (the night-mode tokens) and the
 * `Wordmark` component, so the maintenance page looks like the live portal.
 */

/**
 * The complete maintenance page. `robots: noindex` keeps it out of search
 * results; Umami tracks visits under the developer-portal website id.
 */
export const COMING_SOON_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>coming soon · musiccloud for developers</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
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
      :root {
        --sky-top: #08090b;
        --sky-bottom: #1a1c22;
        --fg: #ececf1;
        --fg-muted: #9fb0bc;
        --fg-subtle: #67676f;
        --surface: rgba(255, 255, 255, 0.045);
        --border: rgba(255, 255, 255, 0.09);
        --border-strong: rgba(255, 255, 255, 0.16);
        --accent: #28a8d8;
        --accent-hover: #45bfe8;

        --rainbow: linear-gradient(
          90deg,
          #ff6699 0%,
          #9966ff 14%,
          #4d99ff 28%,
          #00cce6 42%,
          #00e6b3 57%,
          #80e64d 71%,
          #e6e64d 85%,
          #ffb34d 100%
        );
        --suffix-fade: linear-gradient(90deg, var(--fg) 0%, var(--fg-subtle) 100%);

        --font-sans: "Barlow", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        --font-condensed: "Barlow Condensed", "Barlow", sans-serif;
        --font-logo: "Audiowide", var(--font-sans);

        --radius-button: 0.5rem;
      }

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
        font-family: var(--font-sans);
        color: var(--fg);
        background: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 100%);
        background-image:
          radial-gradient(120% 55% at 50% -8%, color-mix(in srgb, var(--accent), transparent 86%) 0%, transparent 60%),
          linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 100%);
        background-attachment: fixed;
        display: flex;
        flex-direction: column;
        -webkit-font-smoothing: antialiased;
      }

      .shell {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 3rem 1.5rem;
        gap: 2rem;
      }

      .text-gradient {
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .wordmark {
        display: inline-flex;
        align-items: baseline;
        gap: 0.5rem;
        font-size: clamp(1.6rem, 4vw, 2.1rem);
        line-height: 1;
        animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .wordmark .brand {
        font-family: var(--font-logo);
        font-weight: 400;
        background-image: var(--rainbow);
      }

      .wordmark .suffix {
        font-family: var(--font-condensed);
      }

      .wordmark .suffix .slash {
        color: var(--fg);
        font-weight: 600;
      }

      .wordmark .suffix .word {
        font-weight: 400;
        background-image: var(--suffix-fade);
      }

      .rule {
        width: clamp(120px, 22vw, 220px);
        height: 2px;
        border-radius: 2px;
        background-image: var(--rainbow);
        opacity: 0.9;
        animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
      }

      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.1rem;
        animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
      }

      .hero h1 {
        margin: 0;
        font-family: var(--font-condensed);
        font-weight: 600;
        font-size: clamp(2.75rem, 9vw, 5.5rem);
        line-height: 0.95;
        letter-spacing: 0.01em;
      }

      .hero p {
        margin: 0;
        max-width: 34rem;
        font-size: clamp(1.05rem, 2.4vw, 1.25rem);
        line-height: 1.55;
        color: var(--fg-muted);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: center;
        animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.7rem 1.15rem;
        border-radius: var(--radius-button);
        font-family: var(--font-condensed);
        font-weight: 500;
        font-size: 1.05rem;
        letter-spacing: 0.01em;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--fg);
        text-decoration: none;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.15s ease;
      }

      .btn:hover {
        border-color: var(--border-strong);
        background: rgba(255, 255, 255, 0.07);
        transform: translateY(-1px);
      }

      .btn.primary {
        border-color: color-mix(in srgb, var(--accent), transparent 45%);
        background: color-mix(in srgb, var(--accent), transparent 82%);
        color: var(--accent-hover);
      }

      .btn.primary:hover {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent), transparent 72%);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #00e6b3;
        box-shadow: 0 0 10px 1px color-mix(in srgb, #00e6b3, transparent 40%);
      }

      footer {
        padding: 1.5rem;
        text-align: center;
        color: var(--fg-subtle);
        font-size: 0.9rem;
      }

      footer a {
        color: var(--fg-muted);
        text-decoration: none;
      }

      footer a:hover {
        color: var(--fg);
        text-decoration: underline;
        text-underline-offset: 3px;
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
        <h1>coming soon</h1>
        <p>
          Public API access and developer tools for musiccloud are on the way. We are putting the finishing touches on
          the platform and will open the doors shortly.
        </p>
      </div>

      <div class="actions">
        <a class="btn primary" href="https://status.musiccloud.io"><span class="dot"></span> System status</a>
        <a class="btn" href="https://musiccloud.io">Back to musiccloud</a>
      </div>
    </main>

    <footer>&copy; 2026 musiccloud. Built for people who love music.</footer>
  </body>
</html>
`;
