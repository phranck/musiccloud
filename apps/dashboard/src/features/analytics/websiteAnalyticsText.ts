import type { DashboardLocale } from "@/i18n/messages";

export interface WebsiteCopy {
  badge: string;
  loading: string;
  noData: string;
  directTraffic: string;
  topQuery: string;
  lastSeen: string;
  exportJson: string;
  retention: string;
  retentionDone: string;
  clearSelection: string;
  selectedScope: string;
  scopeLabels: {
    overview: string;
    cluster: string;
    device: string;
    session: string;
  };
  inspectorLabels: {
    event: string;
    cluster: string;
    confidence: string;
    session: string;
    surface: string;
    platform: string;
    route: string;
    referrer: string;
    device: string;
    detail: string;
    occurredAt: string;
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
    funnel: string;
    households: string;
    referrers: string;
    clickpath: string;
    drilldown: string;
    deviceDrilldown: string;
    sessionDrilldown: string;
    inspector: string;
    interactions: string;
    searches: string;
    timeline: string;
  };
  columns: {
    platform: string;
    route: string;
    resolves: string;
    share: string;
    household: string;
    confidence: string;
    devices: string;
    searches: string;
    query: string;
    event: string;
    count: string;
    clusters: string;
    sessions: string;
    events: string;
    pageviews: string;
    firstSeen: string;
    entry: string;
    exit: string;
    sourceWebsite: string;
  };
  pathHint: string;
}

const COPY: Record<DashboardLocale, WebsiteCopy> = {
  de: {
    badge: "First-party Website Analytics",
    loading: "Lade echte Website-Analytics...",
    noData: "Noch keine Daten im gewaehlten Zeitraum.",
    directTraffic: "Direkt / keine Website",
    topQuery: "Top-Suche",
    lastSeen: "Zuletzt",
    exportJson: "JSON exportieren",
    retention: "Retention ausfuehren",
    retentionDone: "Retention abgeschlossen",
    clearSelection: "Auswahl loeschen",
    selectedScope: "Aktiver Drilldown",
    scopeLabels: {
      overview: "Uebersicht",
      cluster: "Cluster",
      device: "Geraet",
      session: "Session",
    },
    inspectorLabels: {
      event: "Event",
      cluster: "Cluster",
      confidence: "Sicherheit",
      session: "Session",
      surface: "Bereich",
      platform: "Plattform",
      route: "Route",
      referrer: "Quelle",
      device: "Geraet",
      detail: "Detail",
      occurredAt: "Zeitpunkt",
    },
    eventLabels: {
      page_view: "Seitenaufruf",
      search_submitted: "Suche gesendet",
      resolve_started: "Resolve gestartet",
      resolve_succeeded: "Resolve erfolgreich",
      resolve_failed: "Resolve fehlgeschlagen",
      listen_on_clicked: "Listen-On geklickt",
      similar_artist_clicked: "Aehnlicher Artist geklickt",
      popular_track_clicked: "Popular Track geklickt",
      upcoming_event_clicked: "Upcoming Event geklickt",
      player_started: "Player gestartet",
      player_paused: "Player pausiert",
      player_resumed: "Player fortgesetzt",
      player_completed: "Player beendet",
      player_unavailable: "Player nicht verfuegbar",
      info_page_clicked: "Info-Seite geklickt",
      help_page_clicked: "Help-Seite geklickt",
      live_example_clicked: "Live-Beispiel geklickt",
      layered_footer_clicked: "LAYERED-Footer geklickt",
      ui_click: "UI-Klick",
    },
    identifierLabels: {
      artist_panel: "Artist Panel",
      content_body: "Content",
      content_links: "Links / CTAs",
      embed_card: "Embed Card",
      fallback_action: "Fallback-Aktion",
      filters: "Filter",
      footer: "Footer",
      genre_columns: "Genre-Spalten",
      genre_query: "Genre-Suche",
      genre_results: "Genre-Ergebnisse",
      header_nav: "Header Navigation",
      help_page: "Help-Seite",
      hero: "Hero",
      info_page: "Info-Seite",
      landing: "Landingpage",
      landing_example: "Landing-Beispiel",
      layered_footer: "LAYERED-Footer",
      live_example: "Live-Beispiel",
      listen_on: "Listen-On",
      logo: "Logo",
      nav_link: "Navigation",
      overlay: "Overlay",
      overlay_card: "Overlay Card",
      overlay_content: "Overlay Content",
      overlay_nav: "Overlay Navigation",
      media_card: "Media Card + Player",
      page_title: "Seitentitel",
      player: "Player",
      popular_track: "Popular Track",
      popular_tracks: "Popular Tracks",
      redirect_status: "Redirect-Status",
      results: "Suchergebnis / Kandidaten",
      search_input: "Sucheingabe",
      share_card: "Share Card",
      similar_artist: "Similar Artist",
      similar_artists: "Similar Artists",
      text_results: "Suchergebnisse",
      system_menu: "Systemmenue",
      upcoming_event: "Upcoming Event",
      upcoming_events: "Upcoming Events",
      ui: "UI",
      unknown: "Unbekannt",
    },
    confidenceLabels: {
      low: "Niedrig",
      medium: "Mittel",
      high: "Hoch",
    },
    routeLabels: {
      "/": "Landingpage",
      "/:shortId": "Sharepage",
      "/content/:slug": "Info-/Help-Seite",
      "/embed/:shortId": "Embed",
      "/link/:id": "Link-Redirect",
    },
    kpis: {
      clusters: "Network Cluster",
      devices: "Geraete",
      sessions: "Sessions",
      pageviews: "Pageviews",
      searches: "Suchen",
      resolves: "Resolves",
      listenOn: "Listen-On Klicks",
      interactions: "Interaktionen",
      playerStarts: "Player Starts",
    },
    sections: {
      funnel: "Resolve Funnel nach Plattform",
      households: "Geschaetzte Haushalte",
      referrers: "Website-Quellen",
      clickpath: "Clickpath Flow",
      drilldown: "Cluster-, Device- und Session-Drilldown",
      deviceDrilldown: "Geraete-Drilldown",
      sessionDrilldown: "Session-Drilldown",
      inspector: "Node-Inspector",
      interactions: "Interaktionen",
      searches: "Suchbegriffe",
      timeline: "Letzte Events",
    },
    columns: {
      platform: "Plattform",
      route: "Route",
      resolves: "Resolves",
      share: "Anteil",
      household: "Cluster",
      confidence: "Sicherheit",
      devices: "Geraete",
      searches: "Suchen",
      query: "Suchbegriff",
      event: "Event",
      count: "Anzahl",
      clusters: "Cluster",
      sessions: "Sessions",
      events: "Events",
      pageviews: "Pageviews",
      firstSeen: "Erster Besuch",
      entry: "Entry",
      exit: "Exit",
      sourceWebsite: "Website",
    },
    pathHint:
      "Der Flow zeigt die echte Eventfolge des aktivsten Network Clusters im Zeitraum. Nodes sind anklickbar und fuellen den Inspector.",
  },
  en: {
    badge: "First-party Website Analytics",
    loading: "Loading real website analytics...",
    noData: "No data in the selected period yet.",
    directTraffic: "Direct / no website",
    topQuery: "Top query",
    lastSeen: "Last seen",
    exportJson: "Export JSON",
    retention: "Run retention",
    retentionDone: "Retention completed",
    clearSelection: "Clear selection",
    selectedScope: "Active drilldown",
    scopeLabels: {
      overview: "Overview",
      cluster: "Cluster",
      device: "Device",
      session: "Session",
    },
    inspectorLabels: {
      event: "Event",
      cluster: "Cluster",
      confidence: "Confidence",
      session: "Session",
      surface: "Surface",
      platform: "Platform",
      route: "Route",
      referrer: "Source",
      device: "Device",
      detail: "Detail",
      occurredAt: "Timestamp",
    },
    eventLabels: {
      page_view: "Page View",
      search_submitted: "Search Submitted",
      resolve_started: "Resolve Started",
      resolve_succeeded: "Resolve Succeeded",
      resolve_failed: "Resolve Failed",
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
      embed_card: "Embed Card",
      fallback_action: "Fallback Action",
      filters: "Filters",
      footer: "Footer",
      genre_columns: "Genre Columns",
      genre_query: "Genre Search",
      genre_results: "Genre Results",
      header_nav: "Header Navigation",
      help_page: "Help Page",
      hero: "Hero",
      info_page: "Info Page",
      landing: "Landing Page",
      landing_example: "Landing Example",
      layered_footer: "LAYERED Footer",
      live_example: "Live Example",
      listen_on: "Listen-On",
      logo: "Logo",
      nav_link: "Navigation",
      overlay: "Overlay",
      overlay_card: "Overlay Card",
      overlay_content: "Overlay Content",
      overlay_nav: "Overlay Navigation",
      media_card: "Media Card + Player",
      page_title: "Page Title",
      player: "Player",
      popular_track: "Popular Track",
      popular_tracks: "Popular Tracks",
      redirect_status: "Redirect Status",
      results: "Search Result / Candidates",
      search_input: "Search Input",
      share_card: "Share Card",
      similar_artist: "Similar Artist",
      similar_artists: "Similar Artists",
      text_results: "Search Results",
      system_menu: "System Menu",
      upcoming_event: "Upcoming Event",
      upcoming_events: "Upcoming Events",
      ui: "UI",
      unknown: "Unknown",
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
      clusters: "Network Clusters",
      devices: "Devices",
      sessions: "Sessions",
      pageviews: "Pageviews",
      searches: "Searches",
      resolves: "Resolves",
      listenOn: "Listen-On Clicks",
      interactions: "Interactions",
      playerStarts: "Player Starts",
    },
    sections: {
      funnel: "Resolve Funnel by Platform",
      households: "Estimated Households",
      referrers: "Website Sources",
      clickpath: "Clickpath Flow",
      drilldown: "Cluster, Device and Session Drilldown",
      deviceDrilldown: "Device Drilldown",
      sessionDrilldown: "Session Drilldown",
      inspector: "Node Inspector",
      interactions: "Interactions",
      searches: "Search Terms",
      timeline: "Recent Events",
    },
    columns: {
      platform: "Platform",
      route: "Route",
      resolves: "Resolves",
      share: "Share",
      household: "Cluster",
      confidence: "Confidence",
      devices: "Devices",
      searches: "Searches",
      query: "Query",
      event: "Event",
      count: "Count",
      clusters: "Clusters",
      sessions: "Sessions",
      events: "Events",
      pageviews: "Pageviews",
      firstSeen: "First seen",
      entry: "Entry",
      exit: "Exit",
      sourceWebsite: "Website",
    },
    pathHint:
      "The flow shows the real event sequence for the most active network cluster in the period. Nodes are selectable and populate the inspector.",
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
