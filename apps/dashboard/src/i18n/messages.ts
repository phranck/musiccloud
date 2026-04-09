export type DashboardLocale = "de" | "en";

export interface DashboardMessages {
  languageName: string;
  common: {
    ok: string;
    cancel: string;
    save: string;
    saving: string;
    saved: string;
    edit: string;
    delete: string;
    remove: string;
    duplicate: string;
    copyUrl: string;
    close: string;
    loading: string;
    unknownError: string;
  };
  layout: {
    menuOpen: string;
    menuClose: string;
    resizeSidebar: string;
    pageFallbackTitle: string;
    sidebar: {
      sectionGeneral: string;
      sectionMusic: string;
      sectionContent: string;
      sectionTemplates: string;
      sectionAnalytics: string;
      analytics: string;
      sectionSystem: string;
      overview: string;
      tracks: string;
      albums: string;
      artists: string;
      media: string;
      users: string;
      pages: string;
      pagesOverview: string;
      navigations: string;
      formBuilder: string;
      formsOverview: string;
      emailTemplates: string;
      emailTemplatesOverview: string;
      footerBuilder: string;
      markdownWidgets: string;
      system: string;
      expandAll: string;
      collapseAll: string;
      expandAllAria: string;
      collapseAllAria: string;
      editProfile: string;
      logout: string;
      logoutConfirmTitle: string;
      logoutConfirmDescription: string;
      logoutConfirmAction: string;
      logoutSkipConfirm: string;
      logoutConfirmLabel: string;
      roles: {
        owner: string;
        admin: string;
        moderator: string;
      };
    };
  };
  auth: {
    logoAlt: string;
    adminArea: string;
    login: {
      title: string;
      username: string;
      password: string;
      invalidCredentials: string;
      submit: string;
      submitLoading: string;
    };
    invite: {
      title: string;
      subtitle: string;
      password: string;
      confirmPassword: string;
      passwordMismatch: string;
      invalidLink: string;
      submit: string;
      submitLoading: string;
      toLogin: string;
    };
    setup: {
      welcome: string;
      title: string;
      subtitle: string;
      email: string;
      confirmPassword: string;
      passwordMismatch: string;
      genericError: string;
      submit: string;
      submitLoading: string;
    };
  };
  dashboard: {
    overviewTitle: string;
    cards: {
      tracks: string;
      albums: string;
      artists: string;
      users: string;
    };
  };
  music: {
    tracks: {
      title: string;
      searchPlaceholder: string;
      total: string;
      noTracks: string;
      noTracksHint: string;
      colTitle: string;
      colArtists: string;
      colSource: string;
      colLinks: string;
      colAdded: string;
      colActions: string;
    };
    trackEdit: {
      backLabel: string;
      title: string;
      artists: string;
      artistsHint: string;
      albumName: string;
      isrc: string;
      artworkUrl: string;
      sourceService: string;
      sourceUrl: string;
      serviceLinks: string;
      serviceUrls: string;
      createdAt: string;
      notFound: string;
      saveError: string;
    };
    albums: {
      title: string;
      searchPlaceholder: string;
      total: string;
      noAlbums: string;
      noAlbumsHint: string;
      colTitle: string;
      colArtists: string;
      colSource: string;
      colTracks: string;
      colLinks: string;
      colAdded: string;
    };
    artists: {
      title: string;
      searchPlaceholder: string;
      total: string;
      noArtists: string;
      noArtistsHint: string;
      colName: string;
      colGenres: string;
      colSource: string;
      colLinks: string;
      colAdded: string;
    };
    table: {
      editButton: string;
      deleteButton: string;
      deleteConfirmTitle: string;
      deleteConfirmDescription: string;
      deleteConfirmCancel: string;
      deleteConfirmAction: string;
      featuredAdd: string;
      featuredRemove: string;
    };
  };
  system: {
    title: string;
    cacheTitle: string;
    artistCacheLabel: string;
    artistCacheDescription: string;
    artistCacheClear: string;
    dangerZoneTitle: string;
    deleteAllLabel: string;
    deleteAllDescriptionWithCounts: string;
    deleteAllDescriptionGeneric: string;
    deleteAllIrreversible: string;
    deleteAllSuccess: string;
    deleteAllButton: string;
    deleteAllConfirm: string;
    deleteAllCancel: string;
    entriesDeleted: string;
    trackingTitle: string;
    trackingLabel: string;
    trackingDescription: string;
    trackingEnabled: string;
    trackingDisabled: string;
  };
  media: {
    title: string;
    upload: string;
    uploading: string;
    uploadHint: string;
    empty: string;
    emptyHint: string;
    selectPrompt: string;
    detailsTitle: string;
    previewTitle: string;
    infoTitle: string;
    displayName: string;
    originalName: string;
    fileType: string;
    dimensions: string;
    fileSize: string;
    internalUrl: string;
    createdAt: string;
    updatedAt: string;
    uploadedBy: string;
    saveName: string;
    openFile: string;
    copyUrl: string;
    copied: string;
    renameError: string;
    uploadError: string;
    unsupportedPreview: string;
    deleteTitle: string;
    deleteDescription: string;
    table: {
      name: string;
      type: string;
      size: string;
      updated: string;
    };
  };
  users: {
    title: string;
    inviteUser: string;
    you: string;
    role: {
      owner: string;
      admin: string;
      moderator: string;
    };
    editTitle: string;
    remove: string;
    removeConfirmTitle: string;
    removeConfirmDescription: string;
    createCard: {
      closeAria: string;
      title: string;
      role: string;
      username: string;
      email: string;
      inviteFlowHint: string;
      welcomeTemplate: string;
      welcomeTemplateNone: string;
      inviteCreated: string;
      inviteHint: string;
      inviteLink: string;
      copyInvite: string;
      inviteCopied: string;
      templateVariablesLabel: string;
      templateVariableUsername: string;
      templateVariableEmail: string;
      templateVariableRole: string;
      templateVariableInviteUrl: string;
      templateVariableLoginUrl: string;
      errorCreating: string;
      creating: string;
      create: string;
    };
    editCard: {
      title: string;
      uploadImage: string;
      useGravatar: string;
      removeAvatar: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      password: string;
      passwordPlaceholder: string;
      roleAdmin: string;
      roleModerator: string;
      language: string;
      sessionTimeout: string;
      sessionTimeoutNone: string;
      errorSaving: string;
      editTooltip: string;
    };
  };
  content: {
    editor: {
      decreaseFontSize: string;
      increaseFontSize: string;
      deletePage: string;
      confirmDelete: string;
      confirmDeleteAction: string;
      saved: string;
      titleLabel: string;
      slugLabel: string;
      statusLabel: string;
      ok: string;
      statusDraft: string;
      statusPublished: string;
      statusHidden: string;
      showTitleLabel: string;
      createdBy: string;
      updatedBy: string;
      loadingContent: string;
      saveError: string;
      preview: string;
      shortcuts: {
        save: string;
        bold: string;
        italic: string;
        strikethrough: string;
        link: string;
      };
    };
    footerBuilder: {
      title: string;
      saveError: string;
      styleTitle: string;
      paletteTitle: string;
      noSettings: string;
      headlineTextLabel: string;
      contentLabel: string;
      buttonLabelField: string;
      buttonLabelPlaceholder: string;
      urlLabel: string;
      urlPlaceholder: string;
      styleLabel: string;
      externalLink: string;
      directionLabel: string;
      styleOptions: {
        filled: string;
        outline: string;
        ghost: string;
      };
      directionOptions: {
        vertical: string;
        horizontal: string;
      };
      colorFields: {
        background: string;
        text: string;
        headlines: string;
        links: string;
        linkHover: string;
        button: string;
        buttonText: string;
      };
      sizeOptions: {
        small: string;
        medium: string;
        large: string;
        extraLarge: string;
      };
      heightLabel: string;
      verticalPaddingLabel: string;
      previewTitle: string;
      noPreviewLoaded: string;
      moveColumn: string;
      removeColumn: string;
      dragBlockHere: string;
      removeBlock: string;
      columnSpan: {
        narrow: string;
        normal: string;
        wide: string;
      };
      blockLabels: {
        headline: string;
        markdown: string;
        button: string;
        footerNav: string;
        separator: string;
      };
    };
    markdownWidgets: {
      title: string;
      widgetsTitle: string;
      widgetsHint: string;
      newWidget: string;
      emptyTitle: string;
      emptyHint: string;
      active: string;
      inactive: string;
      markdownLabel: string;
      deleteWidget: string;
      keyLabel: string;
      keyHint: string;
      nameLabel: string;
      typeLabel: string;
      typeHint: string;
      defaultHeightLabel: string;
      defaultHeightHint: string;
      enabledLabel: string;
      descriptionLabel: string;
      descriptionHint: string;
      configurationTitle: string;
      usageTitle: string;
      widgetUsage: string;
      imageUsage: string;
      pdfUsage: string;
      pdfExampleLabel: string;
      emptySelection: string;
      types: {
        html: {
          label: string;
          description: string;
          snippetLabel: string;
          snippetHint: string;
        };
        iframe: {
          label: string;
          description: string;
          urlLabel: string;
          urlHint: string;
        };
      };
    };
    linkPicker: {
      insertInternalLink: string;
      closeSelection: string;
      searchPlaceholder: string;
      noResults: string;
      groups: {
        static: string;
        pages: string;
        forms: string;
      };
    };
    loadingFallback: string;
    pages: {
      title: string;
      newPage: string;
      createTitle: string;
      fieldTitle: string;
      fieldSlug: string;
      titlePlaceholder: string;
      slugPlaceholder: string;
      create: string;
      creating: string;
      createError: string;
      confirmDeletePrefix: string;
      confirmDeleteSuffix: string;
      loadPages: string;
      emptyPages: string;
      emptyPagesHint: string;
      deletePageTitle: string;
      table: {
        title: string;
        slug: string;
        status: string;
        createdBy: string;
        updatedBy: string;
      };
      status: {
        published: string;
        hidden: string;
        draft: string;
      };
    };
  };
  formBuilder: {
    title: string;
    listTitle: string;
    newForm: string;
    formNameLabel: string;
    formSlugLabel: string;
    formSlugHint: string;
    create: string;
    backToList: string;
    slugLabel: string;
    slugPlaceholder: string;
    save: string;
    saved: string;
    saveError: string;
    empty: string;
    editButton: string;
    noForms: string;
    noFormsHint: string;
    slugConflict: string;
    nameConflict: string;
    noFieldSelected: string;
    noFieldSelectedHint: string;
    deleteConfirmPrefix: string;
    deleteConfirmSuffix: string;
    deleteConfirmDescription: string;
    tableColumns: {
      name: string;
      status: string;
    };
    status: {
      active: string;
      inactive: string;
      activate: string;
      deactivate: string;
    };
    panel: {
      label: string;
      fieldName: string;
      rows: string;
      placeholder: string;
      required: string;
      span: string;
      options: string;
      optionsHint: string;
      validationMin: string;
      validationMax: string;
      maxChars: string;
      subtext: string;
      content: string;
      variant: string;
      variantDefault: string;
      variantInfo: string;
      variantWarning: string;
      variantHint: string;
      buttonType: string;
      buttonTypeButton: string;
      buttonTypeSubmit: string;
      buttonTypeReset: string;
      buttonWidth: string;
      buttonWidthAutomatic: string;
      buttonWidthFull: string;
      buttonAlign: string;
      buttonAlignLeft: string;
      buttonAlignCenter: string;
      buttonAlignRight: string;
      buttonIcon: string;
      buttonIconNone: string;
      buttonDisplay: string;
      buttonDisplayText: string;
      buttonDisplayIcon: string;
      buttonDisplayBoth: string;
      headlineLevel: string;
      headlineLevelH1: string;
      headlineLevelH2: string;
      headlineLevelH3: string;
      separatorNoSettings: string;
      loadingEditor: string;
      validation: string;
      spanAriaOf: string;
      iconPickerSearch: string;
      iconPickerEmpty: string;
      allowMarkdown: string;
    };
    submission: {
      title: string;
      addStep: string;
      addStepButton: string;
      stepStore: string;
      stepEmail: string;
      stepMoveAria: string;
      stepRemoveAria: string;
      emailTo: string;
      emailToStatic: string;
      emailToFromField: string;
      emailSubject: string;
      emailSubjectPlaceholder: string;
      emailTemplate: string;
      emailTemplateNone: string;
      successBehaviourLabel: string;
      successMessage: string;
      successHeadline: string;
      successHeadlinePlaceholder: string;
      successMessagePlaceholder: string;
      successRedirect: string;
      noSteps: string;
    };
    moveRow: string;
    removeField: string;
  };
  emailTemplates: {
    listTitle: string;
    newTemplate: string;
    editTemplate: string;
    templateName: string;
    templateSubject: string;
    subjectPlaceholder: string;
    headerBanner: string;
    headerText: string;
    bodyText: string;
    footerBanner: string;
    footerText: string;
    deleteTemplate: string;
    deleteTemplateConfirm: string;
    noTemplates: string;
    noTemplatesHint: string;
    backToList: string;
    save: string;
    saved: string;
    saveError: string;
    nameConflict: string;
    systemBadge: string;
    tableCreated: string;
    preview: string;
    previewTitle: string;
    sectionHeader: string;
    sectionBody: string;
    sectionFooter: string;
  };
  analytics: {
    title: string;
    noData: string;
    noRealtimeData: string;
    unknown: string;
    direct: string;
    home: string;
    visitors: string;
    pageviews: string;
    bounceRate: string;
    averageDuration: string;
    resolves: string;
    interactions: string;
    topResolvesByService: string;
    topLinkClicksByService: string;
    showAllRows: string;
    showLessRows: string;
    realtime: {
      title: string;
      active5m: string;
      pageviews30m: string;
      updatedEvery30s: string;
    };
    traffic: string;
    topPages: string;
    sources: string;
    environment: string;
    location: string;
    countries: string;
    regions: string;
    cities: string;
    country: string;
    region: string;
    city: string;
    browser: string;
    os: string;
    devices: string;
    device: string;
    percentColumn: string;
    umamiNotConfigured: string;
    periods: {
      today: string;
      d7: string;
      d30: string;
      d60: string;
      d90: string;
    };
    durationUnits: {
      secondsShort: string;
      minutesShort: string;
    };
  };
  errors: {
    boundary: {
      title: string;
      fallbackMessage: string;
      reload: string;
      retry: string;
    };
  };
}

export const DASHBOARD_MESSAGES: Record<DashboardLocale, DashboardMessages> = {
  de: {
    languageName: "Deutsch",
    common: {
      ok: "OK",
      cancel: "Abbrechen",
      save: "Speichern",
      saving: "Wird gespeichert\u2026",
      saved: "Gespeichert",
      edit: "Bearbeiten",
      delete: "L\u00f6schen",
      remove: "Entfernen",
      duplicate: "Duplizieren",
      copyUrl: "URL kopieren",
      close: "Schlie\u00dfen",
      loading: "Lade\u2026",
      unknownError: "Unbekannter Fehler",
    },
    layout: {
      menuOpen: "Men\u00fc \u00f6ffnen",
      menuClose: "Men\u00fc schlie\u00dfen",
      resizeSidebar: "Seitenleiste anpassen",
      pageFallbackTitle: "Dashboard",
      sidebar: {
        sectionGeneral: "Allgemein",
        sectionMusic: "Musik",
        sectionContent: "Inhalte",
        sectionTemplates: "Vorlagen",
        sectionAnalytics: "Analyse",
        analytics: "Statistiken",
        sectionSystem: "System",
        overview: "\u00dcbersicht",
        tracks: "Tracks",
        albums: "Alben",
        artists: "K\u00fcnstler",
        media: "Medien",
        users: "Benutzer",
        pages: "Seiten",
        pagesOverview: "\u00dcbersicht",
        navigations: "Navigationen",
        formBuilder: "Formulare",
        formsOverview: "\u00dcbersicht",
        emailTemplates: "E-Mail-Vorlagen",
        emailTemplatesOverview: "\u00dcbersicht",
        footerBuilder: "Footer-Builder",
        markdownWidgets: "Markdown-Widgets",
        system: "System",
        expandAll: "Alle aufklappen",
        collapseAll: "Alle zuklappen",
        expandAllAria: "Alle Gruppen aufklappen",
        collapseAllAria: "Alle Gruppen zuklappen",
        editProfile: "Profil bearbeiten",
        logout: "Abmelden",
        logoutConfirmTitle: "Abmelden",
        logoutConfirmDescription: "M\u00f6chtest du dich wirklich abmelden?",
        logoutConfirmAction: "Abmelden",
        logoutSkipConfirm: "Nicht mehr fragen",
        logoutConfirmLabel: "Abmeldebest\u00e4tigung",
        roles: {
          owner: "Eigent\u00fcmer",
          admin: "Administrator",
          moderator: "Moderator",
        },
      },
    },
    auth: {
      logoAlt: "musiccloud Logo",
      adminArea: "Admin-Bereich",
      login: {
        title: "Anmelden",
        username: "Benutzername",
        password: "Passwort",
        invalidCredentials: "Benutzername oder Passwort falsch",
        submit: "Anmelden",
        submitLoading: "Anmelden\u2026",
      },
      invite: {
        title: "Einladung annehmen",
        subtitle: "Lege ein Passwort f\u00fcr deinen Account fest.",
        password: "Passwort",
        confirmPassword: "Passwort wiederholen",
        passwordMismatch: "Passw\u00f6rter stimmen nicht \u00fcberein",
        invalidLink: "Ung\u00fcltiger oder abgelaufener Einladungslink",
        submit: "Account aktivieren",
        submitLoading: "Wird aktiviert\u2026",
        toLogin: "Zur Anmeldung",
      },
      setup: {
        welcome: "Willkommen",
        title: "Ersteinrichtung",
        subtitle: "Erstelle den ersten Administrator-Account.",
        email: "E-Mail",
        confirmPassword: "Passwort wiederholen",
        passwordMismatch: "Passw\u00f6rter stimmen nicht \u00fcberein",
        genericError: "Ein Fehler ist aufgetreten",
        submit: "Account erstellen",
        submitLoading: "Wird erstellt\u2026",
      },
    },
    dashboard: {
      overviewTitle: "\u00dcbersicht",
      cards: {
        tracks: "Tracks",
        albums: "Alben",
        artists: "K\u00fcnstler",
        users: "Benutzer",
      },
    },
    music: {
      tracks: {
        title: "Tracks",
        searchPlaceholder: "Tracks suchen\u2026",
        total: "Tracks",
        noTracks: "Keine Tracks vorhanden",
        noTracksHint: "Tracks werden automatisch beim Aufl\u00f6sen von Links erstellt.",
        colTitle: "Titel",
        colArtists: "K\u00fcnstler",
        colSource: "Quelle",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
        colActions: "",
      },
      trackEdit: {
        backLabel: "Tracks",
        title: "Titel",
        artists: "K\u00fcnstler",
        artistsHint: "Kommagetrennt",
        albumName: "Album",
        isrc: "ISRC",
        artworkUrl: "Artwork URL",
        sourceService: "Quelle",
        sourceUrl: "Quell-URL",
        serviceLinks: "Service-Links",
        serviceUrls: "Service URLs",
        createdAt: "Hinzugef\u00fcgt",
        notFound: "Track nicht gefunden",
        saveError: "Fehler beim Speichern",
      },
      albums: {
        title: "Alben",
        searchPlaceholder: "Alben suchen\u2026",
        total: "Alben",
        noAlbums: "Keine Alben vorhanden",
        noAlbumsHint: "Alben werden automatisch beim Aufl\u00f6sen von Links erstellt.",
        colTitle: "Titel",
        colArtists: "K\u00fcnstler",
        colSource: "Quelle",
        colTracks: "Tracks",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
      },
      artists: {
        title: "K\u00fcnstler",
        searchPlaceholder: "K\u00fcnstler suchen\u2026",
        total: "K\u00fcnstler",
        noArtists: "Keine K\u00fcnstler vorhanden",
        noArtistsHint: "K\u00fcnstler werden automatisch beim Aufl\u00f6sen von Links erstellt.",
        colName: "Name",
        colGenres: "Genres",
        colSource: "Quelle",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
      },
      table: {
        editButton: "Bearbeiten",
        deleteButton: "L\u00f6schen ({count})",
        deleteConfirmTitle: "Eintr\u00e4ge l\u00f6schen",
        deleteConfirmDescription: "{count} Eintr\u00e4ge werden unwiderruflich gel\u00f6scht.",
        deleteConfirmCancel: "Abbrechen",
        deleteConfirmAction: "L\u00f6schen",
        featuredAdd: "Als Featured markieren",
        featuredRemove: "Featured entfernen",
      },
    },
    system: {
      title: "System",
      cacheTitle: "Cache",
      artistCacheLabel: "Artist-Cache leeren",
      artistCacheDescription:
        "L\u00f6scht alle gecachten Artist-Infos (Top-Tracks, Profil, Tourdaten). Werden beim n\u00e4chsten Aufruf neu geladen.",
      artistCacheClear: "Leeren",
      dangerZoneTitle: "Danger Zone",
      deleteAllLabel: "Alle Daten l\u00f6schen",
      deleteAllDescriptionWithCounts:
        "L\u00f6scht {tracks} {tracksLabel} und {albums} {albumsLabel} inkl. aller Links, Short-URLs und Caches. User-Accounts bleiben unber\u00fchrt.",
      deleteAllDescriptionGeneric:
        "L\u00f6scht alle Tracks, Alben, Links, Short-URLs und Caches. User-Accounts bleiben unber\u00fchrt.",
      deleteAllIrreversible: "Diese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden.",
      deleteAllSuccess: "{tracks} {tracksLabel} und {albums} {albumsLabel} wurden gel\u00f6scht.",
      deleteAllButton: "Zur\u00fccksetzen\u2026",
      deleteAllConfirm: "Ja, alles l\u00f6schen",
      deleteAllCancel: "Abbrechen",
      entriesDeleted: "{count} Eintr\u00e4ge gel\u00f6scht.",
      trackingTitle: "Website-Tracking",
      trackingLabel: "Umami Analytics",
      trackingDescription:
        "Aktiviert das Umami-Tracking-Script auf der Website. Wenn deaktiviert, wird kein Tracking-Code eingebunden.",
      trackingEnabled: "Aktiv",
      trackingDisabled: "Deaktiviert",
    },
    media: {
      title: "Medien",
      upload: "Hochladen",
      uploading: "Wird hochgeladen\u2026",
      uploadHint: "Dateien hierher ziehen oder klicken",
      empty: "Keine Medien vorhanden",
      emptyHint: "Lade Bilder und Dateien hoch.",
      selectPrompt: "W\u00e4hle eine Datei aus",
      detailsTitle: "Details",
      previewTitle: "Vorschau",
      infoTitle: "Informationen",
      displayName: "Anzeigename",
      originalName: "Originalname",
      fileType: "Dateityp",
      dimensions: "Abmessungen",
      fileSize: "Dateigr\u00f6\u00dfe",
      internalUrl: "Interne URL",
      createdAt: "Erstellt am",
      updatedAt: "Aktualisiert am",
      uploadedBy: "Hochgeladen von",
      saveName: "Name speichern",
      openFile: "Datei \u00f6ffnen",
      copyUrl: "URL kopieren",
      copied: "Kopiert!",
      renameError: "Fehler beim Umbenennen",
      uploadError: "Fehler beim Hochladen",
      unsupportedPreview: "Vorschau nicht verf\u00fcgbar",
      deleteTitle: "Datei l\u00f6schen",
      deleteDescription: "M\u00f6chtest du diese Datei wirklich l\u00f6schen?",
      table: {
        name: "Name",
        type: "Typ",
        size: "Gr\u00f6\u00dfe",
        updated: "Aktualisiert",
      },
    },
    users: {
      title: "Benutzer",
      inviteUser: "Benutzer einladen",
      you: "(du)",
      role: { owner: "Eigent\u00fcmer", admin: "Administrator", moderator: "Moderator" },
      editTitle: "Benutzer bearbeiten",
      remove: "Entfernen",
      removeConfirmTitle: "Benutzer entfernen",
      removeConfirmDescription: "M\u00f6chtest du diesen Benutzer wirklich entfernen?",
      createCard: {
        closeAria: "Schlie\u00dfen",
        title: "Benutzer einladen",
        role: "Rolle",
        username: "Benutzername",
        email: "E-Mail",
        inviteFlowHint: "Der Benutzer erh\u00e4lt einen Einladungslink.",
        welcomeTemplate: "Willkommens-Vorlage",
        welcomeTemplateNone: "Keine",
        inviteCreated: "Einladung erstellt",
        inviteHint: "Teile den folgenden Link mit dem Benutzer:",
        inviteLink: "Einladungslink",
        copyInvite: "Link kopieren",
        inviteCopied: "Kopiert!",
        templateVariablesLabel: "Verf\u00fcgbare Variablen",
        templateVariableUsername: "Benutzername",
        templateVariableEmail: "E-Mail",
        templateVariableRole: "Rolle",
        templateVariableInviteUrl: "Einladungs-URL",
        templateVariableLoginUrl: "Login-URL",
        errorCreating: "Fehler beim Erstellen",
        creating: "Wird erstellt\u2026",
        create: "Einladen",
      },
      editCard: {
        title: "Benutzer bearbeiten",
        uploadImage: "Bild hochladen",
        useGravatar: "Gravatar verwenden",
        removeAvatar: "Avatar entfernen",
        username: "Benutzername",
        email: "E-Mail",
        firstName: "Vorname",
        lastName: "Nachname",
        role: "Rolle",
        password: "Neues Passwort",
        passwordPlaceholder: "Leer lassen, um Passwort beizubehalten",
        roleAdmin: "Administrator",
        roleModerator: "Moderator",
        language: "Sprache",
        sessionTimeout: "Inaktivitäts-Timeout (Minuten)",
        sessionTimeoutNone: "Kein automatischer Logout",
        errorSaving: "Fehler beim Speichern",
        editTooltip: "Bearbeiten",
      },
    },
    content: {
      editor: {
        decreaseFontSize: "Schrift verkleinern",
        increaseFontSize: "Schrift vergr\u00f6\u00dfern",
        deletePage: "Seite l\u00f6schen",
        confirmDelete: "Wirklich l\u00f6schen?",
        confirmDeleteAction: "L\u00f6schen",
        saved: "Gespeichert",
        titleLabel: "Titel",
        slugLabel: "Slug",
        statusLabel: "Status",
        ok: "OK",
        statusDraft: "Entwurf",
        statusPublished: "Ver\u00f6ffentlicht",
        statusHidden: "Versteckt",
        showTitleLabel: "Titel anzeigen",
        createdBy: "Erstellt von",
        updatedBy: "Aktualisiert von",
        loadingContent: "Inhalt wird geladen\u2026",
        saveError: "Fehler beim Speichern",
        preview: "Vorschau",
        shortcuts: {
          save: "Speichern",
          bold: "Fett",
          italic: "Kursiv",
          strikethrough: "Durchgestrichen",
          link: "Link einf\u00fcgen",
        },
      },
      footerBuilder: {
        title: "Footer-Builder",
        saveError: "Fehler beim Speichern",
        styleTitle: "Stil",
        paletteTitle: "Farbpalette",
        noSettings: "Keine Einstellungen",
        headlineTextLabel: "\u00dcberschrift",
        contentLabel: "Inhalt",
        buttonLabelField: "Beschriftung",
        buttonLabelPlaceholder: "Button-Text",
        urlLabel: "URL",
        urlPlaceholder: "https://...",
        styleLabel: "Stil",
        externalLink: "Externer Link",
        directionLabel: "Richtung",
        styleOptions: { filled: "Ausgef\u00fcllt", outline: "Umriss", ghost: "Transparent" },
        directionOptions: { vertical: "Vertikal", horizontal: "Horizontal" },
        colorFields: {
          background: "Hintergrund",
          text: "Text",
          headlines: "\u00dcberschriften",
          links: "Links",
          linkHover: "Link-Hover",
          button: "Button",
          buttonText: "Button-Text",
        },
        sizeOptions: { small: "Klein", medium: "Mittel", large: "Gro\u00df", extraLarge: "Sehr gro\u00df" },
        heightLabel: "H\u00f6he",
        verticalPaddingLabel: "Vertikaler Abstand",
        previewTitle: "Vorschau",
        noPreviewLoaded: "Keine Vorschau geladen",
        moveColumn: "Spalte verschieben",
        removeColumn: "Spalte entfernen",
        dragBlockHere: "Block hierher ziehen",
        removeBlock: "Block entfernen",
        columnSpan: { narrow: "Schmal", normal: "Normal", wide: "Breit" },
        blockLabels: {
          headline: "\u00dcberschrift",
          markdown: "Markdown",
          button: "Button",
          footerNav: "Footer-Navigation",
          separator: "Trennlinie",
        },
      },
      markdownWidgets: {
        title: "Markdown-Widgets",
        widgetsTitle: "Widgets",
        widgetsHint: "Verwalte eingebettete Inhalte.",
        newWidget: "Neues Widget",
        emptyTitle: "Keine Widgets",
        emptyHint: "Erstelle ein Widget, um eingebettete Inhalte zu verwalten.",
        active: "Aktiv",
        inactive: "Inaktiv",
        markdownLabel: "Markdown",
        deleteWidget: "Widget l\u00f6schen",
        keyLabel: "Schl\u00fcssel",
        keyHint: "Eindeutiger Bezeichner",
        nameLabel: "Name",
        typeLabel: "Typ",
        typeHint: "Art des Widgets",
        defaultHeightLabel: "Standardh\u00f6he",
        defaultHeightHint: "H\u00f6he in Pixeln",
        enabledLabel: "Aktiviert",
        descriptionLabel: "Beschreibung",
        descriptionHint: "Optionale Beschreibung",
        configurationTitle: "Konfiguration",
        usageTitle: "Verwendung",
        widgetUsage: "Widget einbetten",
        imageUsage: "Bild einbetten",
        pdfUsage: "PDF einbetten",
        pdfExampleLabel: "Beispiel",
        emptySelection: "Kein Widget ausgew\u00e4hlt",
        types: {
          html: {
            label: "HTML",
            description: "HTML-Snippet einbetten",
            snippetLabel: "Snippet",
            snippetHint: "HTML-Code",
          },
          iframe: {
            label: "iFrame",
            description: "Externe Seite einbetten",
            urlLabel: "URL",
            urlHint: "Externe URL",
          },
        },
      },
      linkPicker: {
        insertInternalLink: "Internen Link einf\u00fcgen",
        closeSelection: "Auswahl schlie\u00dfen",
        searchPlaceholder: "Seiten suchen\u2026",
        noResults: "Keine Ergebnisse",
        groups: { static: "Statische Routen", pages: "Seiten", forms: "Formulare" },
      },
      loadingFallback: "Wird geladen\u2026",
      pages: {
        title: "Seiten",
        newPage: "Neue Seite",
        createTitle: "Seite erstellen",
        fieldTitle: "Titel",
        fieldSlug: "Slug",
        titlePlaceholder: "Seitentitel",
        slugPlaceholder: "seiten-slug",
        create: "Erstellen",
        creating: "Wird erstellt\u2026",
        createError: "Fehler beim Erstellen",
        confirmDeletePrefix: "Seite",
        confirmDeleteSuffix: "wirklich l\u00f6schen?",
        loadPages: "Seiten laden\u2026",
        emptyPages: "Keine Seiten vorhanden",
        emptyPagesHint: "Erstelle eine neue Seite.",
        deletePageTitle: "Seite l\u00f6schen",
        table: {
          title: "Titel",
          slug: "Slug",
          status: "Status",
          createdBy: "Erstellt von",
          updatedBy: "Aktualisiert von",
        },
        status: { published: "Ver\u00f6ffentlicht", hidden: "Versteckt", draft: "Entwurf" },
      },
    },
    formBuilder: {
      title: "Formulare",
      listTitle: "Formulare",
      newForm: "Neues Formular",
      formNameLabel: "Name",
      formSlugLabel: "Slug",
      formSlugHint: "\u00d6ffentlicher Pfad",
      create: "Erstellen",
      backToList: "Zur\u00fcck",
      slugLabel: "Slug",
      slugPlaceholder: "formular-slug",
      save: "Speichern",
      saved: "Gespeichert",
      saveError: "Fehler beim Speichern",
      empty: "Ziehe Felder in das Formular",
      editButton: "Bearbeiten",
      noForms: "Keine Formulare vorhanden",
      noFormsHint: "Erstelle ein neues Formular.",
      slugConflict: "Slug bereits vergeben",
      nameConflict: "Name bereits vergeben",
      noFieldSelected: "Kein Feld ausgew\u00e4hlt",
      noFieldSelectedHint: "W\u00e4hle ein Feld, um es zu bearbeiten.",
      deleteConfirmPrefix: "Formular",
      deleteConfirmSuffix: "wirklich l\u00f6schen?",
      deleteConfirmDescription: "Alle zugeordneten Einsendungen werden ebenfalls gel\u00f6scht.",
      tableColumns: { name: "Name", status: "Status" },
      status: {
        active: "Aktiv",
        inactive: "Inaktiv",
        activate: "Aktivieren",
        deactivate: "Deaktivieren",
      },
      panel: {
        label: "Beschriftung",
        fieldName: "Feldname",
        rows: "Zeilen",
        placeholder: "Platzhalter",
        required: "Pflichtfeld",
        span: "Breite",
        options: "Optionen",
        optionsHint: "Eine Option pro Zeile",
        validationMin: "Minimum",
        validationMax: "Maximum",
        maxChars: "Max. Zeichen",
        subtext: "Untertext",
        content: "Inhalt",
        variant: "Variante",
        variantDefault: "Standard",
        variantInfo: "Info",
        variantWarning: "Warnung",
        variantHint: "Hinweis",
        buttonType: "Button-Typ",
        buttonTypeButton: "Button",
        buttonTypeSubmit: "Absenden",
        buttonTypeReset: "Zur\u00fccksetzen",
        buttonWidth: "Breite",
        buttonWidthAutomatic: "Automatisch",
        buttonWidthFull: "Volle Breite",
        buttonAlign: "Ausrichtung",
        buttonAlignLeft: "Links",
        buttonAlignCenter: "Zentriert",
        buttonAlignRight: "Rechts",
        buttonIcon: "Icon",
        buttonIconNone: "Keins",
        buttonDisplay: "Anzeige",
        buttonDisplayText: "Text",
        buttonDisplayIcon: "Icon",
        buttonDisplayBoth: "Beides",
        headlineLevel: "\u00dcberschriftsebene",
        headlineLevelH1: "\u00dcberschrift 1",
        headlineLevelH2: "\u00dcberschrift 2",
        headlineLevelH3: "\u00dcberschrift 3",
        separatorNoSettings: "Keine Einstellungen",
        loadingEditor: "Editor wird geladen\u2026",
        validation: "Validierung",
        spanAriaOf: "von",
        iconPickerSearch: "Icon suchen\u2026",
        iconPickerEmpty: "Keine Icons gefunden",
        allowMarkdown: "Markdown erlauben",
      },
      submission: {
        title: "Einreichung",
        addStep: "Schritt hinzuf\u00fcgen",
        addStepButton: "Schritt",
        stepStore: "Speichern",
        stepEmail: "E-Mail senden",
        stepMoveAria: "Schritt verschieben",
        stepRemoveAria: "Schritt entfernen",
        emailTo: "Empf\u00e4nger",
        emailToStatic: "Feste Adresse",
        emailToFromField: "Aus Formularfeld",
        emailSubject: "Betreff",
        emailSubjectPlaceholder: "E-Mail-Betreff",
        emailTemplate: "E-Mail-Vorlage",
        emailTemplateNone: "Keine",
        successBehaviourLabel: "Nach dem Absenden",
        successMessage: "Erfolgsmeldung",
        successHeadline: "\u00dcberschrift",
        successHeadlinePlaceholder: "Vielen Dank!",
        successMessagePlaceholder: "Deine Nachricht wurde gesendet.",
        successRedirect: "Weiterleitung",
        noSteps: "Keine Schritte konfiguriert",
      },
      moveRow: "Zeile verschieben",
      removeField: "Feld entfernen",
    },
    emailTemplates: {
      listTitle: "E-Mail-Vorlagen",
      newTemplate: "Neue Vorlage",
      editTemplate: "Vorlage bearbeiten",
      templateName: "Name",
      templateSubject: "Betreff",
      subjectPlaceholder: "E-Mail-Betreff",
      headerBanner: "Header-Banner",
      headerText: "Header-Text",
      bodyText: "Inhalt",
      footerBanner: "Footer-Banner",
      footerText: "Footer-Text",
      deleteTemplate: "Vorlage l\u00f6schen",
      deleteTemplateConfirm: "Wirklich l\u00f6schen?",
      noTemplates: "Keine Vorlagen vorhanden",
      noTemplatesHint: "Erstelle eine neue E-Mail-Vorlage.",
      backToList: "Zur\u00fcck",
      save: "Speichern",
      saved: "Gespeichert",
      saveError: "Fehler beim Speichern",
      nameConflict: "Name bereits vergeben",
      systemBadge: "System",
      tableCreated: "Erstellt",
      preview: "Vorschau",
      previewTitle: "E-Mail-Vorschau",
      sectionHeader: "Header",
      sectionBody: "Inhalt",
      sectionFooter: "Footer",
    },
    analytics: {
      title: "Analytics",
      noData: "Keine Daten",
      noRealtimeData: "Keine Realtime-Daten",
      unknown: "(Unbekannt)",
      direct: "(Direkt)",
      home: "Startseite",
      visitors: "Besucher",
      pageviews: "Seitenaufrufe",
      bounceRate: "Absprungrate",
      averageDuration: "\u00d8 Verweildauer",
      resolves: "Resolves",
      interactions: "Interaktionen",
      topResolvesByService: "Top Resolves nach Service",
      topLinkClicksByService: "Top Link-Klicks nach Service",
      showAllRows: "Alle anzeigen",
      showLessRows: "Weniger anzeigen",
      realtime: {
        title: "Live",
        active5m: "aktiv (5 min)",
        pageviews30m: "Aufrufe (30 min)",
        updatedEvery30s: "aktualisiert alle 30 s",
      },
      traffic: "Traffic",
      topPages: "Top Seiten",
      sources: "Quellen",
      environment: "Environment",
      location: "Location",
      countries: "L\u00e4nder",
      regions: "Regionen",
      cities: "St\u00e4dte",
      country: "Land",
      region: "Region",
      city: "Stadt",
      browser: "Browser",
      os: "OS",
      devices: "Ger\u00e4te",
      device: "Ger\u00e4t",
      percentColumn: "%",
      umamiNotConfigured: "Umami nicht konfiguriert (UMAMI_URL, UMAMI_USERNAME, UMAMI_PASSWORD, UMAMI_WEBSITE_ID).",
      periods: {
        today: "Heute",
        d7: "7 Tage",
        d30: "30 Tage",
        d60: "60 Tage",
        d90: "90 Tage",
      },
      durationUnits: {
        secondsShort: "s",
        minutesShort: "m",
      },
    },
    errors: {
      boundary: {
        title: "Etwas ist schiefgelaufen",
        fallbackMessage: "Ein unerwarteter Fehler ist aufgetreten.",
        reload: "Zur Startseite",
        retry: "Erneut versuchen",
      },
    },
  },
  en: {
    languageName: "English",
    common: {
      ok: "OK",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving\u2026",
      saved: "Saved",
      edit: "Edit",
      delete: "Delete",
      remove: "Remove",
      duplicate: "Duplicate",
      copyUrl: "Copy URL",
      close: "Close",
      loading: "Loading\u2026",
      unknownError: "Unknown error",
    },
    layout: {
      menuOpen: "Open menu",
      menuClose: "Close menu",
      resizeSidebar: "Resize sidebar",
      pageFallbackTitle: "Dashboard",
      sidebar: {
        sectionGeneral: "General",
        sectionMusic: "Music",
        sectionContent: "Content",
        sectionTemplates: "Templates",
        sectionAnalytics: "Analytics",
        analytics: "Statistics",
        sectionSystem: "System",
        overview: "Overview",
        tracks: "Tracks",
        albums: "Albums",
        artists: "Artists",
        media: "Media",
        users: "Users",
        pages: "Pages",
        pagesOverview: "Overview",
        navigations: "Navigations",
        formBuilder: "Forms",
        formsOverview: "Overview",
        emailTemplates: "Email Templates",
        emailTemplatesOverview: "Overview",
        footerBuilder: "Footer Builder",
        markdownWidgets: "Markdown Widgets",
        system: "System",
        expandAll: "Expand all",
        collapseAll: "Collapse all",
        expandAllAria: "Expand all groups",
        collapseAllAria: "Collapse all groups",
        editProfile: "Edit profile",
        logout: "Log out",
        logoutConfirmTitle: "Log out",
        logoutConfirmDescription: "Are you sure you want to log out?",
        logoutConfirmAction: "Log out",
        logoutSkipConfirm: "Don't ask again",
        logoutConfirmLabel: "Logout confirmation",
        roles: {
          owner: "Owner",
          admin: "Administrator",
          moderator: "Moderator",
        },
      },
    },
    auth: {
      logoAlt: "musiccloud Logo",
      adminArea: "Admin Area",
      login: {
        title: "Sign In",
        username: "Username",
        password: "Password",
        invalidCredentials: "Invalid username or password",
        submit: "Sign In",
        submitLoading: "Signing in\u2026",
      },
      invite: {
        title: "Accept Invitation",
        subtitle: "Set a password for your account.",
        password: "Password",
        confirmPassword: "Confirm Password",
        passwordMismatch: "Passwords do not match",
        invalidLink: "Invalid or expired invitation link",
        submit: "Activate Account",
        submitLoading: "Activating\u2026",
        toLogin: "Go to Login",
      },
      setup: {
        welcome: "Welcome",
        title: "Initial Setup",
        subtitle: "Create the first administrator account.",
        email: "Email",
        confirmPassword: "Confirm Password",
        passwordMismatch: "Passwords do not match",
        genericError: "An error occurred",
        submit: "Create Account",
        submitLoading: "Creating\u2026",
      },
    },
    dashboard: {
      overviewTitle: "Overview",
      cards: {
        tracks: "Tracks",
        albums: "Albums",
        artists: "Artists",
        users: "Users",
      },
    },
    music: {
      tracks: {
        title: "Tracks",
        searchPlaceholder: "Search tracks\u2026",
        total: "tracks",
        noTracks: "No tracks yet",
        noTracksHint: "Tracks are created automatically when resolving links.",
        colTitle: "Title",
        colArtists: "Artists",
        colSource: "Source",
        colLinks: "Services",
        colAdded: "Added",
        colActions: "",
      },
      trackEdit: {
        backLabel: "Tracks",
        title: "Title",
        artists: "Artists",
        artistsHint: "Comma-separated",
        albumName: "Album",
        isrc: "ISRC",
        artworkUrl: "Artwork URL",
        sourceService: "Source",
        sourceUrl: "Source URL",
        serviceLinks: "Service Links",
        serviceUrls: "Service URLs",
        createdAt: "Added",
        notFound: "Track not found",
        saveError: "Failed to save",
      },
      albums: {
        title: "Albums",
        searchPlaceholder: "Search albums\u2026",
        total: "albums",
        noAlbums: "No albums yet",
        noAlbumsHint: "Albums are created automatically when resolving links.",
        colTitle: "Title",
        colArtists: "Artists",
        colSource: "Source",
        colTracks: "Tracks",
        colLinks: "Services",
        colAdded: "Added",
      },
      artists: {
        title: "Artists",
        searchPlaceholder: "Search artists\u2026",
        total: "artists",
        noArtists: "No artists yet",
        noArtistsHint: "Artists are created automatically when resolving links.",
        colName: "Name",
        colGenres: "Genres",
        colSource: "Source",
        colLinks: "Services",
        colAdded: "Added",
      },
      table: {
        editButton: "Edit",
        deleteButton: "Delete ({count})",
        deleteConfirmTitle: "Delete entries",
        deleteConfirmDescription: "{count} entries will be permanently deleted.",
        deleteConfirmCancel: "Cancel",
        deleteConfirmAction: "Delete",
        featuredAdd: "Mark as featured",
        featuredRemove: "Remove featured",
      },
    },
    system: {
      title: "System",
      cacheTitle: "Cache",
      artistCacheLabel: "Clear artist cache",
      artistCacheDescription:
        "Deletes all cached artist info (top tracks, profile, tour dates). Will be reloaded on next request.",
      artistCacheClear: "Clear",
      dangerZoneTitle: "Danger Zone",
      deleteAllLabel: "Delete all data",
      deleteAllDescriptionWithCounts:
        "Deletes {tracks} {tracksLabel} and {albums} {albumsLabel} including all links, short URLs and caches. User accounts remain untouched.",
      deleteAllDescriptionGeneric:
        "Deletes all tracks, albums, links, short URLs and caches. User accounts remain untouched.",
      deleteAllIrreversible: "This action cannot be undone.",
      deleteAllSuccess: "{tracks} {tracksLabel} and {albums} {albumsLabel} deleted.",
      deleteAllButton: "Reset\u2026",
      deleteAllConfirm: "Yes, delete all",
      deleteAllCancel: "Cancel",
      entriesDeleted: "{count} entries deleted.",
      trackingTitle: "Website Tracking",
      trackingLabel: "Umami Analytics",
      trackingDescription:
        "Enables the Umami tracking script on the website. When disabled, no tracking code is embedded.",
      trackingEnabled: "Active",
      trackingDisabled: "Disabled",
    },
    media: {
      title: "Media",
      upload: "Upload",
      uploading: "Uploading\u2026",
      uploadHint: "Drag files here or click to upload",
      empty: "No media files",
      emptyHint: "Upload images and files.",
      selectPrompt: "Select a file",
      detailsTitle: "Details",
      previewTitle: "Preview",
      infoTitle: "Information",
      displayName: "Display Name",
      originalName: "Original Name",
      fileType: "File Type",
      dimensions: "Dimensions",
      fileSize: "File Size",
      internalUrl: "Internal URL",
      createdAt: "Created",
      updatedAt: "Updated",
      uploadedBy: "Uploaded by",
      saveName: "Save Name",
      openFile: "Open File",
      copyUrl: "Copy URL",
      copied: "Copied!",
      renameError: "Error renaming",
      uploadError: "Error uploading",
      unsupportedPreview: "Preview not available",
      deleteTitle: "Delete File",
      deleteDescription: "Are you sure you want to delete this file?",
      table: {
        name: "Name",
        type: "Type",
        size: "Size",
        updated: "Updated",
      },
    },
    users: {
      title: "Users",
      inviteUser: "Invite User",
      you: "(you)",
      role: { owner: "Owner", admin: "Administrator", moderator: "Moderator" },
      editTitle: "Edit User",
      remove: "Remove",
      removeConfirmTitle: "Remove User",
      removeConfirmDescription: "Are you sure you want to remove this user?",
      createCard: {
        closeAria: "Close",
        title: "Invite User",
        role: "Role",
        username: "Username",
        email: "Email",
        inviteFlowHint: "The user will receive an invitation link.",
        welcomeTemplate: "Welcome Template",
        welcomeTemplateNone: "None",
        inviteCreated: "Invitation Created",
        inviteHint: "Share the following link with the user:",
        inviteLink: "Invitation Link",
        copyInvite: "Copy Link",
        inviteCopied: "Copied!",
        templateVariablesLabel: "Available Variables",
        templateVariableUsername: "Username",
        templateVariableEmail: "Email",
        templateVariableRole: "Role",
        templateVariableInviteUrl: "Invitation URL",
        templateVariableLoginUrl: "Login URL",
        errorCreating: "Error creating",
        creating: "Creating\u2026",
        create: "Invite",
      },
      editCard: {
        title: "Edit User",
        uploadImage: "Upload Image",
        useGravatar: "Use Gravatar",
        removeAvatar: "Remove Avatar",
        username: "Username",
        email: "Email",
        firstName: "First Name",
        lastName: "Last Name",
        role: "Role",
        password: "New Password",
        passwordPlaceholder: "Leave empty to keep current password",
        roleAdmin: "Administrator",
        roleModerator: "Moderator",
        language: "Language",
        sessionTimeout: "Inactivity timeout (minutes)",
        sessionTimeoutNone: "No automatic logout",
        errorSaving: "Error saving",
        editTooltip: "Edit",
      },
    },
    content: {
      editor: {
        decreaseFontSize: "Decrease font size",
        increaseFontSize: "Increase font size",
        deletePage: "Delete page",
        confirmDelete: "Really delete?",
        confirmDeleteAction: "Delete",
        saved: "Saved",
        titleLabel: "Title",
        slugLabel: "Slug",
        statusLabel: "Status",
        ok: "OK",
        statusDraft: "Draft",
        statusPublished: "Published",
        statusHidden: "Hidden",
        showTitleLabel: "Show title",
        createdBy: "Created by",
        updatedBy: "Updated by",
        loadingContent: "Loading content\u2026",
        saveError: "Error saving",
        preview: "Preview",
        shortcuts: {
          save: "Save",
          bold: "Bold",
          italic: "Italic",
          strikethrough: "Strikethrough",
          link: "Insert link",
        },
      },
      footerBuilder: {
        title: "Footer Builder",
        saveError: "Error saving",
        styleTitle: "Style",
        paletteTitle: "Color Palette",
        noSettings: "No settings",
        headlineTextLabel: "Headline",
        contentLabel: "Content",
        buttonLabelField: "Label",
        buttonLabelPlaceholder: "Button text",
        urlLabel: "URL",
        urlPlaceholder: "https://...",
        styleLabel: "Style",
        externalLink: "External link",
        directionLabel: "Direction",
        styleOptions: { filled: "Filled", outline: "Outline", ghost: "Ghost" },
        directionOptions: { vertical: "Vertical", horizontal: "Horizontal" },
        colorFields: {
          background: "Background",
          text: "Text",
          headlines: "Headlines",
          links: "Links",
          linkHover: "Link Hover",
          button: "Button",
          buttonText: "Button Text",
        },
        sizeOptions: { small: "Small", medium: "Medium", large: "Large", extraLarge: "Extra Large" },
        heightLabel: "Height",
        verticalPaddingLabel: "Vertical Padding",
        previewTitle: "Preview",
        noPreviewLoaded: "No preview loaded",
        moveColumn: "Move column",
        removeColumn: "Remove column",
        dragBlockHere: "Drag block here",
        removeBlock: "Remove block",
        columnSpan: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
        blockLabels: {
          headline: "Headline",
          markdown: "Markdown",
          button: "Button",
          footerNav: "Footer Navigation",
          separator: "Separator",
        },
      },
      markdownWidgets: {
        title: "Markdown Widgets",
        widgetsTitle: "Widgets",
        widgetsHint: "Manage embedded content.",
        newWidget: "New Widget",
        emptyTitle: "No Widgets",
        emptyHint: "Create a widget to manage embedded content.",
        active: "Active",
        inactive: "Inactive",
        markdownLabel: "Markdown",
        deleteWidget: "Delete Widget",
        keyLabel: "Key",
        keyHint: "Unique identifier",
        nameLabel: "Name",
        typeLabel: "Type",
        typeHint: "Widget type",
        defaultHeightLabel: "Default Height",
        defaultHeightHint: "Height in pixels",
        enabledLabel: "Enabled",
        descriptionLabel: "Description",
        descriptionHint: "Optional description",
        configurationTitle: "Configuration",
        usageTitle: "Usage",
        widgetUsage: "Embed widget",
        imageUsage: "Embed image",
        pdfUsage: "Embed PDF",
        pdfExampleLabel: "Example",
        emptySelection: "No widget selected",
        types: {
          html: {
            label: "HTML",
            description: "Embed HTML snippet",
            snippetLabel: "Snippet",
            snippetHint: "HTML code",
          },
          iframe: {
            label: "iFrame",
            description: "Embed external page",
            urlLabel: "URL",
            urlHint: "External URL",
          },
        },
      },
      linkPicker: {
        insertInternalLink: "Insert internal link",
        closeSelection: "Close selection",
        searchPlaceholder: "Search pages\u2026",
        noResults: "No results",
        groups: { static: "Static Routes", pages: "Pages", forms: "Forms" },
      },
      loadingFallback: "Loading\u2026",
      pages: {
        title: "Pages",
        newPage: "New Page",
        createTitle: "Create Page",
        fieldTitle: "Title",
        fieldSlug: "Slug",
        titlePlaceholder: "Page title",
        slugPlaceholder: "page-slug",
        create: "Create",
        creating: "Creating\u2026",
        createError: "Error creating",
        confirmDeletePrefix: "Page",
        confirmDeleteSuffix: "really delete?",
        loadPages: "Loading pages\u2026",
        emptyPages: "No pages yet",
        emptyPagesHint: "Create a new page.",
        deletePageTitle: "Delete Page",
        table: {
          title: "Title",
          slug: "Slug",
          status: "Status",
          createdBy: "Created by",
          updatedBy: "Updated by",
        },
        status: { published: "Published", hidden: "Hidden", draft: "Draft" },
      },
    },
    formBuilder: {
      title: "Forms",
      listTitle: "Forms",
      newForm: "New Form",
      formNameLabel: "Name",
      formSlugLabel: "Slug",
      formSlugHint: "Public path",
      create: "Create",
      backToList: "Back",
      slugLabel: "Slug",
      slugPlaceholder: "form-slug",
      save: "Save",
      saved: "Saved",
      saveError: "Error saving",
      empty: "Drag fields into the form",
      editButton: "Edit",
      noForms: "No forms yet",
      noFormsHint: "Create a new form.",
      slugConflict: "Slug already taken",
      nameConflict: "Name already taken",
      noFieldSelected: "No field selected",
      noFieldSelectedHint: "Select a field to edit it.",
      deleteConfirmPrefix: "Form",
      deleteConfirmSuffix: "really delete?",
      deleteConfirmDescription: "All associated submissions will also be deleted.",
      tableColumns: { name: "Name", status: "Status" },
      status: {
        active: "Active",
        inactive: "Inactive",
        activate: "Activate",
        deactivate: "Deactivate",
      },
      panel: {
        label: "Label",
        fieldName: "Field Name",
        rows: "Rows",
        placeholder: "Placeholder",
        required: "Required",
        span: "Width",
        options: "Options",
        optionsHint: "One option per line",
        validationMin: "Minimum",
        validationMax: "Maximum",
        maxChars: "Max. characters",
        subtext: "Subtext",
        content: "Content",
        variant: "Variant",
        variantDefault: "Default",
        variantInfo: "Info",
        variantWarning: "Warning",
        variantHint: "Hint",
        buttonType: "Button Type",
        buttonTypeButton: "Button",
        buttonTypeSubmit: "Submit",
        buttonTypeReset: "Reset",
        buttonWidth: "Width",
        buttonWidthAutomatic: "Automatic",
        buttonWidthFull: "Full Width",
        buttonAlign: "Alignment",
        buttonAlignLeft: "Left",
        buttonAlignCenter: "Center",
        buttonAlignRight: "Right",
        buttonIcon: "Icon",
        buttonIconNone: "None",
        buttonDisplay: "Display",
        buttonDisplayText: "Text",
        buttonDisplayIcon: "Icon",
        buttonDisplayBoth: "Both",
        headlineLevel: "Heading Level",
        headlineLevelH1: "Heading 1",
        headlineLevelH2: "Heading 2",
        headlineLevelH3: "Heading 3",
        separatorNoSettings: "No settings",
        loadingEditor: "Loading editor\u2026",
        validation: "Validation",
        spanAriaOf: "of",
        iconPickerSearch: "Search icons\u2026",
        iconPickerEmpty: "No icons found",
        allowMarkdown: "Allow Markdown",
      },
      submission: {
        title: "Submission",
        addStep: "Add step",
        addStepButton: "Step",
        stepStore: "Store",
        stepEmail: "Send Email",
        stepMoveAria: "Move step",
        stepRemoveAria: "Remove step",
        emailTo: "Recipient",
        emailToStatic: "Fixed address",
        emailToFromField: "From form field",
        emailSubject: "Subject",
        emailSubjectPlaceholder: "Email subject",
        emailTemplate: "Email template",
        emailTemplateNone: "None",
        successBehaviourLabel: "After submission",
        successMessage: "Success message",
        successHeadline: "Headline",
        successHeadlinePlaceholder: "Thank you!",
        successMessagePlaceholder: "Your message has been sent.",
        successRedirect: "Redirect",
        noSteps: "No steps configured",
      },
      moveRow: "Move row",
      removeField: "Remove field",
    },
    emailTemplates: {
      listTitle: "Email Templates",
      newTemplate: "New Template",
      editTemplate: "Edit Template",
      templateName: "Name",
      templateSubject: "Subject",
      subjectPlaceholder: "Email subject",
      headerBanner: "Header Banner",
      headerText: "Header Text",
      bodyText: "Body",
      footerBanner: "Footer Banner",
      footerText: "Footer Text",
      deleteTemplate: "Delete Template",
      deleteTemplateConfirm: "Really delete?",
      noTemplates: "No templates yet",
      noTemplatesHint: "Create a new email template.",
      backToList: "Back",
      save: "Save",
      saved: "Saved",
      saveError: "Error saving",
      nameConflict: "Name already taken",
      systemBadge: "System",
      tableCreated: "Created",
      preview: "Preview",
      previewTitle: "Email Preview",
      sectionHeader: "Header",
      sectionBody: "Body",
      sectionFooter: "Footer",
    },
    analytics: {
      title: "Analytics",
      noData: "No data",
      noRealtimeData: "No realtime data",
      unknown: "(Unknown)",
      direct: "(Direct)",
      home: "Home",
      visitors: "Visitors",
      pageviews: "Pageviews",
      bounceRate: "Bounce Rate",
      averageDuration: "Avg. Duration",
      resolves: "Resolves",
      interactions: "Interactions",
      topResolvesByService: "Top Resolves by Service",
      topLinkClicksByService: "Top Link Clicks by Service",
      showAllRows: "Show all",
      showLessRows: "Show less",
      realtime: {
        title: "Live",
        active5m: "active (5 min)",
        pageviews30m: "views (30 min)",
        updatedEvery30s: "updated every 30s",
      },
      traffic: "Traffic",
      topPages: "Top Pages",
      sources: "Sources",
      environment: "Environment",
      location: "Location",
      countries: "Countries",
      regions: "Regions",
      cities: "Cities",
      country: "Country",
      region: "Region",
      city: "City",
      browser: "Browser",
      os: "OS",
      devices: "Devices",
      device: "Device",
      percentColumn: "%",
      umamiNotConfigured: "Umami not configured (UMAMI_URL, UMAMI_USERNAME, UMAMI_PASSWORD, UMAMI_WEBSITE_ID).",
      periods: {
        today: "Today",
        d7: "7 Days",
        d30: "30 Days",
        d60: "60 Days",
        d90: "90 Days",
      },
      durationUnits: {
        secondsShort: "s",
        minutesShort: "m",
      },
    },
    errors: {
      boundary: {
        title: "Something went wrong",
        fallbackMessage: "An unexpected error occurred.",
        reload: "Go to Home",
        retry: "Try again",
      },
    },
  },
};
