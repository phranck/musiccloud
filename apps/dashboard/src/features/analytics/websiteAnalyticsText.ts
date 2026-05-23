import type { DashboardLocale } from "@/i18n/messages";

export interface WebsiteCopy {
  loading: string;
  noData: string;
  directTraffic: string;
  topQuery: string;
  lastSeen: string;
  exportJson: string;
  retention: string;
  retentionDone: string;
  clearSelection: string;
  selectEventsHint: string;
  trendNew: string;
  scopeLabels: {
    session: string;
  };
  inspectorLabels: {
    event: string;
    device: string;
  };
  eventLabels: Record<string, string>;
  identifierLabels: Record<string, string>;
  confidenceLabels: Record<string, string>;
  routeLabels: Record<string, string>;
  kpis: {
    clusters: string;
    devices: string;
    sessions: string;
    pageviews: string;
    searches: string;
    resolves: string;
    listenOn: string;
    interactions: string;
    playerStarts: string;
  };
  sections: {
    overview: string;
    funnel: string;
    searchIntents: string;
    households: string;
    referrers: string;
    deviceDrilldown: string;
    sessionDrilldown: string;
    selectionEvents: string;
    interactions: string;
    searches: string;
  };
  columns: {
    intent: string;
    platform: string;
    route: string;
    resolves: string;
    share: string;
    household: string;
    confidence: string;
    devices: string;
    searches: string;
    clusters: string;
    sessions: string;
    events: string;
    pageviews: string;
    detail: string;
    entry: string;
    exit: string;
    occurredAt: string;
    sourceWebsite: string;
  };
}

const COPY: Record<DashboardLocale, WebsiteCopy> = {
  de: {
    loading: "Lade Website-Analytics...",
    noData: "Noch keine Daten im gewählten Zeitraum.",
    directTraffic: "Direkt / keine Website",
    topQuery: "Top-Suche",
    lastSeen: "Zuletzt",
    exportJson: "JSON exportieren",
    retention: "Aufbewahrung bereinigen",
    retentionDone: "Aufbewahrung bereinigt",
    clearSelection: "Auswahl löschen",
    selectEventsHint: "Wähle einen Haushalt, ein Gerät oder eine Sitzung, um die zugehörigen Ereignisse zu sehen.",
    trendNew: "Neu",
    scopeLabels: {
      session: "Sitzung",
    },
    inspectorLabels: {
      event: "Ereignis",
      device: "Gerät",
    },
    eventLabels: {
      page_view: "Seitenaufruf",
      browser_back_forward: "Browser-Historie",
      browser_navigate: "Seite geöffnet",
      browser_reload: "Seite neu geladen",
      close: "Geschlossen",
      drag: "Verschoben",
      overlay_close: "Overlay geschlossen",
      overlay_drag: "Overlay verschoben",
      overlay_resize: "Overlay-Größe geändert",
      resize: "Größe geändert",
      segment: "Unterseite",
      segment_clicked: "Unterseite geklickt",
      search_submitted: "Suche gesendet",
      resolve_started: "Ergebnis gesucht",
      resolve_succeeded: "Ergebnis gefunden",
      resolve_failed: "Ergebnis nicht gefunden",
      listen_on_clicked: "Streaming-Link geklickt",
      similar_artist_clicked: "Ähnlicher Künstler geklickt",
      popular_track_clicked: "Beliebter Track geklickt",
      upcoming_event_clicked: "Anstehendes Ereignis geklickt",
      player_started: "Player gestartet",
      player_paused: "Player pausiert",
      player_resumed: "Player fortgesetzt",
      player_completed: "Player beendet",
      player_unavailable: "Player nicht verfügbar",
      info_page_clicked: "Info-Seite geklickt",
      help_page_clicked: "Hilfeseite geklickt",
      live_example_clicked: "Live-Beispiel geklickt",
      layered_footer_clicked: "LAYERED-Fußzeile geklickt",
      ui_click: "UI-Klick",
    },
    identifierLabels: {
      artist_panel: "Künstlerbereich",
      content_body: "Inhalt",
      content_links: "Links / Aktionen",
      android: "Android",
      chrome: "Chrome",
      chromium: "Chromium",
      desktop: "Desktop",
      disambiguation_selected_candidate: "Suchergebnis ausgewählt",
      edge: "Edge",
      embed_card: "Einbettungskarte",
      fallback_action: "Fallback-Aktion",
      filters: "Filter",
      footer: "Fußzeile",
      firefox: "Firefox",
      genre_columns: "Genre-Spalten",
      genre_query: "Genre-Suche",
      genre_results: "Genre-Ergebnisse",
      header_nav: "Kopfnavigation",
      help_page: "Hilfeseite",
      hero: "Hero-Bereich",
      info_page: "Info-Seite",
      ios: "iOS",
      landing: "Landingpage",
      landing_example: "Landing-Beispiel",
      layered_footer: "LAYERED-Fußzeile",
      linux: "Linux",
      live_example: "Live-Beispiel",
      listen_on: "Streaming-Links",
      logo: "Logo",
      logo_home: "Logo zur Startseite",
      macos: "macOS",
      nav_link: "Navigation",
      overlay: "Overlay",
      overlay_card: "Overlay-Karte",
      overlay_content: "Overlay-Inhalt",
      overlay_nav: "Overlay-Navigation",
      overlay_panel: "Overlay-Bedienfeld",
      media_card: "Medienkarte + Player",
      page_title: "Seitentitel",
      phone: "Smartphone",
      player: "Player",
      popular_track: "Beliebter Track",
      popular_tracks: "Beliebte Tracks",
      redirect_status: "Weiterleitungsstatus",
      results: "Suchergebnis / Kandidaten",
      search_input: "Sucheingabe",
      selected_candidate: "Suchergebnis ausgewählt",
      share_card: "Teilen-Karte",
      safari: "Safari",
      similar_artist: "Ähnlicher Künstler",
      similar_artists: "Ähnliche Künstler",
      genre_search_submitted: "Genre-Suche gesendet",
      text_search_submitted: "Freitextsuche gesendet",
      streaming_url_submitted: "Streaming-URL gesendet",
      text_results: "Suchergebnisse",
      track_context_not_stored: "Track nicht gespeichert",
      system_menu: "Systemmenü",
      tablet: "Tablet",
      upcoming_event: "Anstehendes Ereignis",
      upcoming_events: "Anstehende Ereignisse",
      ui: "UI",
      unknown: "Unbekannt",
      windows: "Windows",
    },
    confidenceLabels: {
      low: "Niedrig",
      medium: "Mittel",
      high: "Hoch",
    },
    routeLabels: {
      "/": "Landingpage",
      "/:shortId": "Share-Seite",
      "/content/:slug": "Info-/Hilfeseite",
      "/embed/:shortId": "Einbettung",
      "/link/:id": "Link-Weiterleitung",
    },
    kpis: {
      clusters: "Haushalte",
      devices: "Geräte",
      sessions: "Sitzungen",
      pageviews: "Seitenaufrufe",
      searches: "Suchen",
      resolves: "Erfolgreiche Suchen",
      listenOn: "Streaming-Link-Klicks",
      interactions: "Interaktionen",
      playerStarts: "Player-Starts",
    },
    sections: {
      overview: "Nutzung im Zeitraum",
      funnel: "Erfolgreiche Suchen nach Musikquelle",
      searchIntents: "Such-Intents",
      households: "Geschätzte Haushalte",
      referrers: "Website-Quellen",
      deviceDrilldown: "Geräte",
      sessionDrilldown: "Sitzungen",
      selectionEvents: "Ereignisse der Auswahl",
      interactions: "Interaktionen",
      searches: "Suchbegriffe",
    },
    columns: {
      intent: "Intent",
      platform: "Musikquelle",
      route: "Seite",
      resolves: "Erfolgreiche Suchen",
      share: "Anteil",
      household: "Haushalt",
      confidence: "Sicherheit",
      devices: "Geräte",
      searches: "Suchen",
      clusters: "Haushalte",
      sessions: "Sitzungen",
      events: "Ereignisse",
      pageviews: "Seitenaufrufe",
      detail: "Detail",
      entry: "Einstieg",
      exit: "Ausstieg",
      occurredAt: "Zeitpunkt",
      sourceWebsite: "Website",
    },
  },
  en: {
    loading: "Loading real website analytics...",
    noData: "No data in the selected period yet.",
    directTraffic: "Direct / no website",
    topQuery: "Top query",
    lastSeen: "Last seen",
    exportJson: "Export JSON",
    retention: "Run retention",
    retentionDone: "Retention completed",
    clearSelection: "Clear selection",
    selectEventsHint: "Select a household, device or session to inspect its related events.",
    trendNew: "New",
    scopeLabels: {
      session: "Session",
    },
    inspectorLabels: {
      event: "Event",
      device: "Device",
    },
    eventLabels: {
      page_view: "Page View",
      browser_back_forward: "History Navigation",
      browser_navigate: "Page Opened",
      browser_reload: "Page Reloaded",
      close: "Closed",
      drag: "Moved",
      overlay_close: "Overlay Closed",
      overlay_drag: "Overlay Moved",
      overlay_resize: "Overlay Resized",
      resize: "Resized",
      segment: "Subpage",
      segment_clicked: "Subpage Clicked",
      search_submitted: "Search Submitted",
      resolve_started: "Lookup Started",
      resolve_succeeded: "Lookup Found",
      resolve_failed: "Lookup Failed",
      listen_on_clicked: "Listen-On Clicked",
      similar_artist_clicked: "Similar Artist Clicked",
      popular_track_clicked: "Popular Track Clicked",
      upcoming_event_clicked: "Upcoming Event Clicked",
      player_started: "Player Started",
      player_paused: "Player Paused",
      player_resumed: "Player Resumed",
      player_completed: "Player Completed",
      player_unavailable: "Player Unavailable",
      info_page_clicked: "Info Page Clicked",
      help_page_clicked: "Help Page Clicked",
      live_example_clicked: "Live Example Clicked",
      layered_footer_clicked: "LAYERED Footer Clicked",
      ui_click: "UI Click",
    },
    identifierLabels: {
      artist_panel: "Artist Panel",
      content_body: "Content",
      content_links: "Links / CTAs",
      android: "Android",
      chrome: "Chrome",
      chromium: "Chromium",
      desktop: "Desktop",
      disambiguation_selected_candidate: "Search Result Selected",
      edge: "Edge",
      embed_card: "Embed Card",
      fallback_action: "Fallback Action",
      filters: "Filters",
      footer: "Footer",
      firefox: "Firefox",
      genre_columns: "Genre Columns",
      genre_query: "Genre Search",
      genre_results: "Genre Results",
      header_nav: "Header Navigation",
      help_page: "Help Page",
      hero: "Hero",
      info_page: "Info Page",
      ios: "iOS",
      landing: "Landing Page",
      landing_example: "Landing Example",
      layered_footer: "LAYERED Footer",
      linux: "Linux",
      live_example: "Live Example",
      listen_on: "Listen-On",
      logo: "Logo",
      logo_home: "Logo to Home",
      macos: "macOS",
      nav_link: "Navigation",
      overlay: "Overlay",
      overlay_card: "Overlay Card",
      overlay_content: "Overlay Content",
      overlay_nav: "Overlay Navigation",
      overlay_panel: "Overlay Panel",
      media_card: "Media Card + Player",
      page_title: "Page Title",
      phone: "Phone",
      player: "Player",
      popular_track: "Popular Track",
      popular_tracks: "Popular Tracks",
      redirect_status: "Redirect Status",
      results: "Search Result / Candidates",
      search_input: "Search Input",
      selected_candidate: "Search Result Selected",
      share_card: "Share Card",
      safari: "Safari",
      similar_artist: "Similar Artist",
      similar_artists: "Similar Artists",
      genre_search_submitted: "Genre Search Submitted",
      text_search_submitted: "Text Search Submitted",
      streaming_url_submitted: "Streaming URL Submitted",
      text_results: "Search Results",
      track_context_not_stored: "Track not stored",
      system_menu: "System Menu",
      tablet: "Tablet",
      upcoming_event: "Upcoming Event",
      upcoming_events: "Upcoming Events",
      ui: "UI",
      unknown: "Unknown",
      windows: "Windows",
    },
    confidenceLabels: {
      low: "Low",
      medium: "Medium",
      high: "High",
    },
    routeLabels: {
      "/": "Landing Page",
      "/:shortId": "Share Page",
      "/content/:slug": "Info / Help Page",
      "/embed/:shortId": "Embed",
      "/link/:id": "Link Redirect",
    },
    kpis: {
      clusters: "Households",
      devices: "Devices",
      sessions: "Sessions",
      pageviews: "Pageviews",
      searches: "Searches",
      resolves: "Successful Lookups",
      listenOn: "Listen-On Clicks",
      interactions: "Interactions",
      playerStarts: "Player Starts",
    },
    sections: {
      overview: "Usage in Period",
      funnel: "Successful Lookups by Music Source",
      searchIntents: "Search Intents",
      households: "Estimated Households",
      referrers: "Website Sources",
      deviceDrilldown: "Devices",
      sessionDrilldown: "Sessions",
      selectionEvents: "Selection Events",
      interactions: "Interactions",
      searches: "Search Terms",
    },
    columns: {
      intent: "Intent",
      platform: "Music Source",
      route: "Route",
      resolves: "Successful Lookups",
      share: "Share",
      household: "Household",
      confidence: "Confidence",
      devices: "Devices",
      searches: "Searches",
      clusters: "Households",
      sessions: "Sessions",
      events: "Events",
      pageviews: "Pageviews",
      detail: "Detail",
      entry: "Entry",
      exit: "Exit",
      occurredAt: "Timestamp",
      sourceWebsite: "Website",
    },
  },
};

const SERVICE_LABELS: Record<string, string> = {
  amazon: "Amazon Music",
  amazon_music: "Amazon Music",
  apple: "Apple Music",
  apple_music: "Apple Music",
  bandcamp: "Bandcamp",
  deezer: "Deezer",
  musicbrainz: "MusicBrainz",
  qobuz: "Qobuz",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  tidal: "TIDAL",
  youtube: "YouTube Music",
  youtube_music: "YouTube Music",
};

export function getWebsiteAnalyticsCopy(locale: DashboardLocale): WebsiteCopy {
  return COPY[locale];
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeIdentifier(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_");
}

export function formatNaturalText(value: string | null | undefined, copy: WebsiteCopy) {
  if (!value) return "-";
  if (value.startsWith("/") || value.startsWith("#")) return value;

  const normalized = normalizeIdentifier(value);
  if (SERVICE_LABELS[normalized]) return SERVICE_LABELS[normalized];
  if (copy.identifierLabels[normalized]) return copy.identifierLabels[normalized];
  if (copy.eventLabels[normalized]) return copy.eventLabels[normalized];

  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => {
      const partKey = normalizeIdentifier(part);
      return SERVICE_LABELS[partKey] ?? copy.identifierLabels[partKey] ?? titleCase(part);
    })
    .join(" ");
}
