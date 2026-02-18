const START_YEAR = 2026;

/**
 * Application footer: copyright + "made by LAYERED" link.
 * Used on all pages (landing page via LandingPage.tsx, share page via Astro SSR).
 */
export function AppFooter() {
  const currentYear = new Date().getFullYear();
  const yearDisplay = currentYear > START_YEAR ? `${START_YEAR} – ${currentYear}` : `${START_YEAR}`;

  return (
    <footer
      className="w-full grid grid-cols-3 items-center px-4 sm:px-6 py-3 text-xs text-text-muted"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <span className="text-left">&copy; {yearDisplay} musiccloud</span>
      <span className="text-center" />
      <span className="text-right">
        made by{" "}
        <a
          href="https://layered.work"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors duration-150 ml-1"
        >
          LAYERED
        </a>
      </span>
    </footer>
  );
}
