export type DashboardLocale = "de" | "en";

export interface DashboardMessages {
  common: {
    ok: string;
    cancel: string;
    save: string;
    saving: string;
    saved: string;
    saveError: string;
    edit: string;
    delete: string;
    remove: string;
    duplicate: string;
    close: string;
    loading: string;
    copied: string;
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
      sectionDeveloper: string;
      apiAccessRequests: string;
      clientsAndTokens: string;
      developerAccounts: string;
      overview: string;
      tracks: string;
      albums: string;
      artists: string;
      users: string;
      pages: string;
      pagesOverview: string;
      navigations: string;
      formBuilder: string;
      formsOverview: string;
      emailTemplates: string;
      emailTemplatesOverview: string;
      emailBranding: string;
      system: string;
      services: string;
      design: string;
      actions: string;
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
      artistEntities: string;
      users: string;
      pendingApiAccessRequests: string;
    };
  };
  developer: {
    requestsTitle: string;
    requestsFilterAll: string;
    requestsFilterPending: string;
    requestsFilterApproved: string;
    requestsFilterRejected: string;
    colApp: string;
    colDeveloper: string;
    colTraffic: string;
    colSubmitted: string;
    colStatus: string;
    detailBackLabel: string;
    detailApprove: string;
    detailReject: string;
    detailRejectReasonLabel: string;
    detailRejectReasonPlaceholder: string;
    detailRejectConfirm: string;
    detailRejectCancel: string;
    detailRateLimitMinute: string;
    detailRateLimitDay: string;
    statusPending: string;
    statusApproved: string;
    statusRejected: string;
    statusActive: string;
    statusSuspended: string;
    statusRevoked: string;
    clientsTitle: string;
    clientsEmpty: string;
    clientsEmptyHint: string;
    clientTrafficLabel: string;
    clientsTokensLabel: string;
    clientsNoTokens: string;
    clientsCreateToken: string;
    clientsRevokeToken: string;
    clientsRotateToken: string;
    clientsDeactivateToken: string;
    tokenRevealTitle: string;
    tokenRevealHint: string;
    tokenRevealCopy: string;
    clientsSearchPlaceholder: string;
    clientsSearchNoResults: string;
    accountsTitle: string;
    colEmail: string;
    colDisplayName: string;
    colPlan: string;
    colAppName: string;
    colRegistered: string;
    overviewCardLabel: string;
    noRequests: string;
    noRequestsHint: string;
    requestCount: string;
    accountCount: string;
    noAccounts: string;
    noAccountsHint: string;
    accountDetailTitle: string;
    accountDetailBackLabel: string;
    accountDetailDeactivate: string;
    accountDetailDeactivateHint: string;
    accountDetailReactivate: string;
    accountDetailDelete: string;
    accountDetailDeleteHint: string;
    accountDetailDeleteConfirm: string;
    copied: string;
    descriptionLabel: string;
    rateLimitsLabel: string;
    perMinute: string;
    perDay: string;
    colKey: string;
  };
  music: {
    tracks: {
      title: string;
      searchPlaceholder: string;
      total: string;
      noTracks: string;
      colTitle: string;
      colArtists: string;
      colSource: string;
      colLinks: string;
      colAdded: string;
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
    };
    albums: {
      title: string;
      searchPlaceholder: string;
      total: string;
      noAlbums: string;
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
      deleteButton: string;
      deleteConfirmTitle: string;
      deleteConfirmDescription: string;
      deleteConfirmAction: string;
      colName: string;
      colGenres: string;
      colSource: string;
      colLinks: string;
      colAdded: string;
      refreshLabel: string;
      refreshTooltip: string;
      refreshConfirm: string;
    };
    table: {
      deleteButton: string;
      deleteConfirmTitle: string;
      deleteConfirmDescription: string;
    };
  };
  system: {
    title: string;
    cacheTitle: string;
    artistCacheLabel: string;
    artistCacheDescription: string;
    artistCacheClear: string;
    shareCacheLabel: string;
    shareCacheDescription: string;
    shareCacheClear: string;
    shareCacheSuccess: string;
    genreCacheLabel: string;
    genreCacheDescription: string;
    genreCacheClear: string;
    dangerZoneTitle: string;
    deleteAllLabel: string;
    deleteAllDescriptionWithCounts: string;
    deleteAllDescriptionGeneric: string;
    deleteAllIrreversible: string;
    deleteAllSuccess: string;
    deleteAllButton: string;
    deleteAllConfirm: string;
    entriesDeleted: string;
    trackingTitle: string;
    trackingLabel: string;
    trackingDescription: string;
    trackingEnabled: string;
    trackingDisabled: string;
  };
  design: {
    title: string;
    description: string;
    jsonLabel: string;
    jsonHint: string;
    reset: string;
    validJson: string;
    invalidJson: string;
    invalidValues: string;
    reloadHint: string;
  };
  services: {
    title: string;
    subtitle: string;
    lastServiceWarning: string;
    enabled: string;
    disabled: string;
    availableLabel: string;
    credentialsMissingLabel: string;
    missingEnvPrefix: string;
    capabilityTrack: string;
    capabilityAlbum: string;
    capabilityArtist: string;
    capabilityIsrc: string;
    capabilityPreview: string;
    capabilityArtwork: string;
    toggleAction: string;
    toggleError: string;
    loadError: string;
    empty: string;
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
    removeConfirmTitle: string;
    removeConfirmDescription: string;
    createCard: {
      title: string;
      role: string;
      username: string;
      email: string;
      inviteFlowHint: string;
      inviteCreated: string;
      inviteHint: string;
      inviteLink: string;
      copyInvite: string;
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
    };
  };
  content: {
    editor: {
      decreaseFontSize: string;
      increaseFontSize: string;
      deletePage: string;
      confirmDelete: string;
      pageTitleLabel: string;
      slugLabel: string;
      statusLabel: string;
      statusDraft: string;
      statusPublished: string;
      statusHidden: string;
      showTitleLabel: string;
      titleAlignmentLabel: string;
      titleAlignmentLeft: string;
      titleAlignmentCenter: string;
      titleAlignmentRight: string;
      createdBy: string;
      updatedBy: string;
      updatedAt: string;
      loadingContent: string;
      preview: string;
    };
    pages: {
      title: string;
      newPage: string;
      createTitle: string;
      fieldTitle: string;
      fieldSlug: string;
      fieldPageType: string;
      pageTypeDefault: string;
      pageTypeSegmented: string;
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
      display: {
        displayMode: string;
        fullscreen: string;
        embossed: string;
        translucent: string;
        overlayWidth: string;
        widthSmall: string;
        widthRegular: string;
        widthBig: string;
        contentCardStyle: string;
        cardStyleDefault: string;
        cardStyleRecessed: string;
      };
      segments: {
        title: string;
        empty: string;
        labelPlaceholder: string;
      };
      table: {
        title: string;
        slug: string;
        status: string;
        type: string;
        createdBy: string;
        updatedAt: string;
        translations: string;
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
    slugLabel: string;
    slugPlaceholder: string;
    empty: string;
    noForms: string;
    noFormsHint: string;
    slugConflict: string;
    nameConflict: string;
    noFieldSelected: string;
    noFieldSelectedHint: string;
    canvasTitle: string;
    paletteTitle: string;
    preferencesTitle: string;
    exportForm: string;
    exportUnsavedWarning: string;
    importForm: string;
    importSuccess: string;
    importError: string;
    importInvalidFile: string;
    importConflictTitle: string;
    importConflictHint: string;
    importNewNameLabel: string;
    importOverwrite: string;
    importRename: string;
    importSkip: string;
    noLabel: string;
    fieldTypes: {
      text: string;
      email: string;
      textarea: string;
      select: string;
      multiSelect: string;
      checkbox: string;
      richtext: string;
      button: string;
      password: string;
      headline: string;
      separator: string;
      paragraph: string;
    };
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
      buttonDisplay: string;
      headlineLevel: string;
      headlineLevelH1: string;
      headlineLevelH2: string;
      headlineLevelH3: string;
      separatorNoSettings: string;
      inputType: string;
      inputTypeText: string;
      inputTypeEmail: string;
      inputTypePassword: string;
      inputTypeUrl: string;
      inputTypeTel: string;
      inputTypeDate: string;
      inputTypeNumber: string;
      buttonAction: string;
      buttonActionNone: string;
      buttonActionOpenUrl: string;
      buttonActionCopyClipboard: string;
      buttonActionClearField: string;
      buttonActionSourceField: string;
      validation: string;
      spanAriaOf: string;
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
      emailReplyTo: string;
      emailReplyToNone: string;
      successText: string;
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
    templateName: string;
    templateSubject: string;
    subjectPlaceholder: string;
    bodyText: string;
    deleteTemplate: string;
    deleteTemplateConfirm: string;
    noTemplates: string;
    noTemplatesHint: string;
    nameConflict: string;
    systemBadge: string;
    tableCreated: string;
    preview: string;
    previewTitle: string;
    blocksTitle: string;
    blockTypeText: string;
    blockTypeButton: string;
    blockTypeImage: string;
    blockTypeDivider: string;
    blockTypeSpacer: string;
    buttonLabel: string;
    buttonUrl: string;
    imageUpload: string;
    imageUploadError: string;
    imageAltText: string;
    spacerHeight: string;
    variablesTitle: string;
    variablesInsertHint: string;
    variablesGroupSystem: string;
    variablesGroupRecipient: string;
    variablesGroupContext: string;
    variablesContextUnbound: string;
    variablesDetectedTitle: string;
    variablesDetectedEmpty: string;
    variablesUnknownWarning: string;
    exportTemplate: string;
    exportAll: string;
    importTemplate: string;
    importSuccess: string;
    importError: string;
    importInvalidFile: string;
    importConflictTitle: string;
    importConflictHint: string;
    importNewNameLabel: string;
    importOverwrite: string;
    importRename: string;
    importSkip: string;
    sendTest: string;
    sendingTest: string;
    testSent: string;
    testFailed: string;
    brandingTitle: string;
    brandingDescription: string;
    brandingHeaderImage: string;
    brandingImageHint: string;
    brandingFooterText: string;
    brandingFooterTextPlaceholder: string;
    brandingLightBackground: string;
    brandingDarkBackground: string;
    brandingBackgroundHint: string;
    brandingGradientTop: string;
    brandingGradientBottom: string;
    brandingGradientImage: string;
    brandingGradientPresets: string;
    assetPickerTitle: string;
    assetPickerChoose: string;
    assetPickerChange: string;
    assetPickerUploadNew: string;
    assetPickerExisting: string;
    assetPickerEmpty: string;
    brandingOverrideTitle: string;
    brandingOverrideHint: string;
    brandingModeDefault: string;
    brandingModeOverride: string;
    brandingInheritsDefault: string;
  };
  emailActions: {
    title: string;
    requiredBadge: string;
    noActionSelected: string;
    variablesTitle: string;
    variablesContextHint: string;
    variablesNone: string;
    boundTemplatesTitle: string;
    noTemplateBound: string;
    deletedTemplateFallback: string;
    assignTemplateTitle: string;
    assignTemplatePlaceholder: string;
    assignTemplateAction: string;
    assignTemplateNoOptions: string;
    bindErrorFallback: string;
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
    events: string;
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
  unsavedGuard: {
    title: string;
    description: string;
    discard: string;
  };
}

export const DASHBOARD_MESSAGES: Record<DashboardLocale, DashboardMessages> = {
  de: {
    common: {
      ok: "OK",
      cancel: "Abbrechen",
      save: "Speichern",
      saving: "Wird gespeichert\u2026",
      saved: "Gespeichert",
      saveError: "Fehler beim Speichern",
      edit: "Bearbeiten",
      delete: "L\u00f6schen",
      remove: "Entfernen",
      duplicate: "Duplizieren",
      close: "Schlie\u00dfen",
      loading: "Wird geladen\u2026",
      copied: "Kopiert!",
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
        users: "Benutzer",
        pages: "Seiten",
        pagesOverview: "\u00dcbersicht",
        navigations: "Navigationen",
        formBuilder: "Formulare",
        formsOverview: "\u00dcbersicht",
        emailTemplates: "E-Mail-Vorlagen",
        emailTemplatesOverview: "\u00dcbersicht",
        emailBranding: "E-Mail-Branding",
        system: "System",
        sectionDeveloper: "Developer",
        apiAccessRequests: "API Access Requests",
        clientsAndTokens: "API Keys",
        developerAccounts: "Developer Accounts",
        services: "Services",
        design: "Design",
        actions: "Aktionen",
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
        artists: "Artist-Profile",
        artistEntities: "Artist-Entities",
        users: "Benutzer",
        pendingApiAccessRequests: "Offene API-Requests",
      },
    },
    developer: {
      requestsTitle: "API-Zugriffsanfragen",
      requestsFilterAll: "Alle",
      requestsFilterPending: "Ausstehend",
      requestsFilterApproved: "Genehmigt",
      requestsFilterRejected: "Abgelehnt",
      colApp: "App",
      colDeveloper: "Entwickler",
      colTraffic: "Geschätztes Volumen",
      colSubmitted: "Eingereicht",
      colStatus: "Status",
      detailBackLabel: "← API Access Requests",
      detailApprove: "Genehmigen",
      detailReject: "Ablehnen",
      detailRejectReasonLabel: "Begründung (erforderlich)",
      detailRejectReasonPlaceholder: "Begründung für die Ablehnung…",
      detailRejectConfirm: "Ablehnen",
      detailRejectCancel: "Abbrechen",
      detailRateLimitMinute: "Anfragen / Minute",
      detailRateLimitDay: "Anfragen / Tag",
      statusPending: "Ausstehend",
      statusApproved: "Genehmigt",
      statusRejected: "Abgelehnt",
      statusActive: "Aktiv",
      statusSuspended: "Suspendiert",
      statusRevoked: "Widerrufen",
      clientsTitle: "API Keys",
      clientsEmpty: "Keine API Keys",
      clientsEmptyHint: "Genehmigte API-Zugriffsanfragen erscheinen hier mit ihrem Key.",
      clientTrafficLabel: "Eingestelltes Volumen",
      clientsTokensLabel: "Tokens",
      clientsNoTokens: "Keine Tokens",
      clientsCreateToken: "Token erstellen",
      clientsRevokeToken: "Widerrufen",
      clientsRotateToken: "Rotieren",
      clientsDeactivateToken: "Deaktivieren",
      clientsSearchPlaceholder: "Keys durchsuchen…",
      clientsSearchNoResults: "Keine Ergebnisse für „{q}“",
      tokenRevealTitle: "Token wird nur einmal angezeigt",
      tokenRevealHint: "Kopiere ihn jetzt. Nach dem Schließen ist er nicht mehr abrufbar.",
      tokenRevealCopy: "In Zwischenablage kopieren",
      accountsTitle: "Developer Accounts",
      colEmail: "E-Mail",
      colDisplayName: "Name",
      colPlan: "Plan",
      colAppName: "App",
      colRegistered: "Registriert",
      overviewCardLabel: "Offene API-Requests",
      noRequests: "Keine offenen Anfragen",
      noRequestsHint: "Sobald Developer API-Zugriff beantragen, erscheinen sie hier zur Prüfung.",
      requestCount: "{n} Anfragen",
      accountCount: "{n} Accounts",
      noAccounts: "Keine Developer Accounts",
      noAccountsHint: "Registrierte Developer erscheinen hier, sobald sie sich im Developer Portal anmelden.",
      accountDetailTitle: "Developer Account",
      accountDetailBackLabel: "← Developer Accounts",
      accountDetailDeactivate: "Deaktivieren",
      accountDetailDeactivateHint:
        "Der Login bleibt möglich, aber der API-Key wird gesperrt. Der Developer kann nur noch DSGVO-Daten anfordern oder seinen Account löschen.",
      accountDetailReactivate: "Reaktivieren",
      accountDetailDelete: "Löschen",
      accountDetailDeleteHint:
        "Der Account und alle zugehörigen Daten (API-Clients, Tokens, Requests) werden unwiderruflich gelöscht.",
      accountDetailDeleteConfirm: "Account wirklich löschen?",
      copied: "Kopiert!",
      descriptionLabel: "Beschreibung",
      rateLimitsLabel: "Ratenlimits",
      perMinute: "/Minute",
      perDay: "/Tag",
      colKey: "API Key",
    },
    music: {
      tracks: {
        title: "Tracks",
        searchPlaceholder: "Tracks suchen\u2026",
        total: "Tracks",
        noTracks: "Keine Tracks vorhanden",
        colTitle: "Titel",
        colArtists: "K\u00fcnstler",
        colSource: "Quelle",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
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
      },
      albums: {
        title: "Alben",
        searchPlaceholder: "Alben suchen\u2026",
        total: "Alben",
        noAlbums: "Keine Alben vorhanden",
        colTitle: "Titel",
        colArtists: "K\u00fcnstler",
        colSource: "Quelle",
        colTracks: "Tracks",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
      },
      artists: {
        title: "Artist-Profile",
        searchPlaceholder: "Artist-Profile suchen\u2026",
        total: "Artist-Profile",
        noArtists: "Keine Artist-Profile vorhanden",
        deleteButton: "Profile l\u00f6schen ({count})",
        deleteConfirmTitle: "Artist-Profile l\u00f6schen",
        deleteConfirmDescription:
          "{count} Artist-Profile werden entfernt. Die normalisierten Artist-Entities und Track-/Album-Credits bleiben erhalten.",
        deleteConfirmAction: "Profile l\u00f6schen",
        colName: "Name",
        colGenres: "Genres",
        colSource: "Quelle",
        colLinks: "Services",
        colAdded: "Hinzugef\u00fcgt",
        refreshLabel: "Auffrischen",
        refreshTooltip: "K\u00fcnstlerdaten neu von der Quelle laden",
        refreshConfirm: "Aufgefrischt",
      },
      table: {
        deleteButton: "L\u00f6schen ({count})",
        deleteConfirmTitle: "Eintr\u00e4ge l\u00f6schen",
        deleteConfirmDescription: "{count} Eintr\u00e4ge werden unwiderruflich gel\u00f6scht.",
      },
    },
    system: {
      title: "System",
      cacheTitle: "Cache",
      artistCacheLabel: "Artist-Cache leeren",
      artistCacheDescription:
        "L\u00f6scht alle gecachten Artist-Infos (Top-Tracks, Profil, Tourdaten). Werden beim n\u00e4chsten Aufruf neu geladen.",
      artistCacheClear: "Leeren",
      shareCacheLabel: "Share-Cache auffrischen",
      shareCacheDescription:
        "Markiert alle Tracks, Alben und Artists als stale. Beim n\u00e4chsten Aufruf eines Shares werden die Quelldaten neu von den Services geladen. Share-URLs bleiben erhalten.",
      shareCacheClear: "Auffrischen",
      shareCacheSuccess: "{tracks} Tracks, {albums} Alben, {artists} Artists aufgefrischt.",
      genreCacheLabel: "Genre-Cache leeren",
      genreCacheDescription:
        "L\u00f6scht alle generierten Genre-Artworks aus der Datenbank und den In-Memory-Browse-Grid-Cache. Beim n\u00e4chsten Aufruf von `genre:?` werden die Kacheln neu geladen und die Artworks frisch gerendert.",
      genreCacheClear: "Leeren",
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
      entriesDeleted: "{count} Eintr\u00e4ge gel\u00f6scht.",
      trackingTitle: "Website-Tracking",
      trackingLabel: "Umami Analytics",
      trackingDescription:
        "Aktiviert das Umami-Tracking-Script auf der Website. Wenn deaktiviert, wird kein Tracking-Code eingebunden.",
      trackingEnabled: "Aktiv",
      trackingDisabled: "Deaktiviert",
    },
    design: {
      title: "Design",
      description: "Erscheinungsbild der Website — Glas-Material, Farben und Nachthimmel.",
      jsonLabel: "Design-Token JSON",
      jsonHint: "Das vom Prototyp exportierte Settings-JSON hier einfügen und speichern.",
      reset: "Verworfen zurücksetzen",
      validJson: "Gültiges JSON",
      invalidJson: "Ungültiges JSON",
      invalidValues: "{count} Werte unzulässig, Standardwerte werden verwendet",
      reloadHint: "Änderungen erscheinen im Frontend beim nächsten Laden (bis zu 60 Sekunden).",
    },
    services: {
      title: "Services",
      subtitle:
        "Aktiviere oder deaktiviere Resolve-Plugins. Bei deaktivierten Services wird kein Cross-Service-Matching gegen sie ausgef\u00fchrt und bestehende Links werden in Share-Seiten ausgeblendet.",
      lastServiceWarning: "Mindestens ein Plugin muss aktiv sein, damit Resolves funktionieren.",
      enabled: "Aktiv",
      disabled: "Inaktiv",
      availableLabel: "Verf\u00fcgbar",
      credentialsMissingLabel: "Credentials fehlen",
      missingEnvPrefix: "Fehlend:",
      capabilityTrack: "Track",
      capabilityAlbum: "Album",
      capabilityArtist: "Artist",
      capabilityIsrc: "ISRC",
      capabilityPreview: "Preview",
      capabilityArtwork: "Artwork",
      toggleAction: "Umschalten",
      toggleError: "Umschalten fehlgeschlagen.",
      loadError: "Plugin-Liste konnte nicht geladen werden.",
      empty: "Keine Plugins installiert.",
    },
    users: {
      title: "Benutzer",
      inviteUser: "Benutzer einladen",
      you: "(du)",
      role: { owner: "Eigent\u00fcmer", admin: "Administrator", moderator: "Moderator" },
      removeConfirmTitle: "Benutzer entfernen",
      removeConfirmDescription: "M\u00f6chtest du diesen Benutzer wirklich entfernen?",
      createCard: {
        title: "Benutzer einladen",
        role: "Rolle",
        username: "Benutzername",
        email: "E-Mail",
        inviteFlowHint: "Der Benutzer erh\u00e4lt einen Einladungslink.",
        inviteCreated: "Einladung erstellt",
        inviteHint: "Teile den folgenden Link mit dem Benutzer:",
        inviteLink: "Einladungslink",
        copyInvite: "Link kopieren",
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
      },
    },
    content: {
      editor: {
        decreaseFontSize: "Schrift verkleinern",
        increaseFontSize: "Schrift vergr\u00f6\u00dfern",
        deletePage: "Seite l\u00f6schen",
        confirmDelete: "Wirklich l\u00f6schen?",
        pageTitleLabel: "Seitentitel",
        slugLabel: "Slug",
        statusLabel: "Status",
        statusDraft: "Entwurf",
        statusPublished: "Ver\u00f6ffentlicht",
        statusHidden: "Versteckt",
        showTitleLabel: "Titel anzeigen",
        titleAlignmentLabel: "Ausrichtung",
        titleAlignmentLeft: "Links",
        titleAlignmentCenter: "Zentriert",
        titleAlignmentRight: "Rechts",
        createdBy: "Erstellt von",
        updatedBy: "Aktualisiert von",
        updatedAt: "Aktualisiert am",
        loadingContent: "Inhalt wird geladen\u2026",
        preview: "Vorschau",
      },
      pages: {
        title: "Seiten",
        newPage: "Neue Seite",
        createTitle: "Seite erstellen",
        fieldTitle: "Titel",
        fieldSlug: "Slug",
        fieldPageType: "Seitentyp",
        pageTypeDefault: "Standard",
        pageTypeSegmented: "Segmentiert",
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
        display: {
          displayMode: "Darstellung",
          fullscreen: "Vollbild",
          embossed: "Embossed-Overlay",
          translucent: "Translucent-Overlay",
          overlayWidth: "Breite",
          widthSmall: "Schmal",
          widthRegular: "Normal",
          widthBig: "Gro\u00df",
          contentCardStyle: "Card-Stil",
          cardStyleDefault: "Direkt",
          cardStyleRecessed: "Recessed",
        },
        segments: {
          title: "Segmente",
          empty: "Noch keine Segmente definiert.",
          labelPlaceholder: "Beschriftung",
        },
        table: {
          title: "Titel",
          slug: "Slug",
          status: "Status",
          type: "Typ",
          createdBy: "Erstellt von",
          updatedAt: "Aktualisiert am",
          translations: "Übersetzungen",
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
      slugLabel: "Slug",
      slugPlaceholder: "formular-slug",
      empty: "Ziehe Felder in das Formular",
      noForms: "Keine Formulare vorhanden",
      noFormsHint: "Erstelle ein neues Formular.",
      slugConflict: "Slug bereits vergeben",
      nameConflict: "Name bereits vergeben",
      noFieldSelected: "Kein Feld ausgew\u00e4hlt",
      noFieldSelectedHint: "W\u00e4hle ein Feld, um es zu bearbeiten.",
      canvasTitle: "Formular",
      paletteTitle: "Felder",
      preferencesTitle: "Einstellungen",
      exportForm: "Exportieren",
      exportUnsavedWarning: "Erst speichern, dann exportieren.",
      importForm: "Importieren",
      importSuccess: "{n} Formulare importiert",
      importError: "Fehler beim Import",
      importInvalidFile: "Ung\u00fcltige Datei",
      importConflictTitle: "Formular \u201e{name}\u201c existiert bereits",
      importConflictHint: "W\u00e4hle, wie mit dem bestehenden Formular verfahren werden soll.",
      importNewNameLabel: "Neuer Name",
      importOverwrite: "\u00dcberschreiben",
      importRename: "Umbenennen",
      importSkip: "\u00dcberspringen",
      noLabel: "Kein Label",
      fieldTypes: {
        text: "Input",
        email: "E-Mail",
        textarea: "Textbereich",
        select: "Auswahl",
        multiSelect: "Mehrfachauswahl",
        checkbox: "Checkbox",
        richtext: "Markdown",
        button: "Button",
        password: "Passwort",
        headline: "\u00dcberschrift",
        separator: "Trennlinie",
        paragraph: "Textabsatz",
      },
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
        buttonDisplay: "Anzeige",
        headlineLevel: "\u00dcberschriftsebene",
        headlineLevelH1: "\u00dcberschrift 1",
        headlineLevelH2: "\u00dcberschrift 2",
        headlineLevelH3: "\u00dcberschrift 3",
        separatorNoSettings: "Keine Einstellungen",
        inputType: "Eingabetyp",
        inputTypeText: "Text",
        inputTypeEmail: "E-Mail",
        inputTypePassword: "Passwort",
        inputTypeUrl: "URL",
        inputTypeTel: "Telefon",
        inputTypeDate: "Datum",
        inputTypeNumber: "Zahl",
        buttonAction: "Button-Aktion",
        buttonActionNone: "Keine",
        buttonActionOpenUrl: "URL \u00f6ffnen",
        buttonActionCopyClipboard: "In Zwischenablage kopieren",
        buttonActionClearField: "Feld leeren",
        buttonActionSourceField: "Quellfeld",
        validation: "Validierung",
        spanAriaOf: "von",
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
        emailReplyTo: "Antwort an (Reply-To)",
        emailReplyToNone: "Keins",
        successText: "Text",
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
      templateName: "Name",
      templateSubject: "Betreff",
      subjectPlaceholder: "E-Mail-Betreff",
      bodyText: "Inhalt",
      deleteTemplate: "Vorlage l\u00f6schen",
      deleteTemplateConfirm: "Wirklich l\u00f6schen?",
      noTemplates: "Keine Vorlagen vorhanden",
      noTemplatesHint: "Erstelle eine neue E-Mail-Vorlage.",
      nameConflict: "Name bereits vergeben",
      systemBadge: "System",
      tableCreated: "Erstellt",
      preview: "Vorschau",
      previewTitle: "E-Mail-Vorschau",
      blocksTitle: "Inhalt",
      blockTypeText: "Text",
      blockTypeButton: "Button",
      blockTypeImage: "Bild",
      blockTypeDivider: "Trennlinie",
      blockTypeSpacer: "Abstand",
      buttonLabel: "Beschriftung",
      buttonUrl: "Ziel-URL",
      imageUpload: "Bild hochladen",
      imageUploadError: "Bild konnte nicht hochgeladen werden",
      imageAltText: "Alt-Text",
      spacerHeight: "H\u00f6he (px)",
      variablesTitle: "Variablen",
      variablesInsertHint: "Klicken f\u00fcgt den Platzhalter an der Cursor-Position ein.",
      variablesGroupSystem: "System",
      variablesGroupRecipient: "Empf\u00e4nger",
      variablesGroupContext: "Aktion",
      variablesContextUnbound: "Aktions-Variablen erscheinen, sobald die Vorlage einer Aktion zugeordnet ist.",
      variablesDetectedTitle: "Im Template verwendet",
      variablesDetectedEmpty: "Keine \u2014 dieses Template nutzt keine {{Platzhalter}}.",
      variablesUnknownWarning:
        "Unbekannte Variablen \u2014 werden beim Senden nicht gef\u00fcllt (Tippfehler oder fehlende Aktions-Zuordnung).",
      exportTemplate: "Exportieren",
      exportAll: "Alle exportieren",
      importTemplate: "Importieren",
      importSuccess: "{n} Vorlagen importiert",
      importError: "Fehler beim Import",
      importInvalidFile: "Ung\u00fcltige Datei",
      importConflictTitle: "Vorlage \u201e{name}\u201c existiert bereits",
      importConflictHint: "W\u00e4hle, wie mit der bestehenden Vorlage verfahren werden soll.",
      importNewNameLabel: "Neuer Name",
      importOverwrite: "\u00dcberschreiben",
      importRename: "Umbenennen",
      importSkip: "\u00dcberspringen",
      sendTest: "Test-Mail senden",
      sendingTest: "Wird gesendet\u2026",
      testSent: "Test-Mail gesendet an {email}",
      testFailed: "Test-Mail fehlgeschlagen",
      brandingTitle: "E-Mail-Branding",
      brandingDescription:
        "Header/Footer-Bild, Footer-Text und Tag/Nacht-Hintergrund sind der globale Default f\u00fcr jede versendete Vorlage \u2014 einzelne Vorlagen k\u00f6nnen jedes Feld \u00fcberschreiben.",
      brandingHeaderImage: "Header-Bild",
      brandingImageHint:
        "JPEG, PNG oder WebP, max. 5 MB. Wird auf 560 px Breite skaliert — empfohlen: ca. 1120 px breit (2× für Retina-Schärfe), breites Banner-Format.",
      brandingFooterText: "Footer-Text",
      brandingFooterTextPlaceholder: "Markdown-Text, der unter jeder Vorlage erscheint",
      brandingLightBackground: "Tag-Hintergrund",
      brandingDarkBackground: "Nacht-Hintergrund",
      brandingBackgroundHint:
        "Immer ein Farbverlauf, optional zusätzlich ein Bild darüber. Zeigt sich in Mail-Clients mit hellem bzw. dunklem Farbschema.",
      brandingGradientTop: "Verlauf oben",
      brandingGradientBottom: "Verlauf unten",
      brandingGradientImage: "Hintergrundbild (optional)",
      brandingGradientPresets: "Bereits verwendet",
      assetPickerTitle: "Bild wählen",
      assetPickerChoose: "Bild wählen",
      assetPickerChange: "Bild ändern",
      assetPickerUploadNew: "Neu hochladen",
      assetPickerExisting: "Bereits hochgeladen",
      assetPickerEmpty: "Noch keine Bilder hochgeladen",
      brandingOverrideTitle: "Branding",
      brandingOverrideHint: "Pro Feld den globalen Default nutzen oder für diese Vorlage überschreiben.",
      brandingModeDefault: "Default",
      brandingModeOverride: "Override",
      brandingInheritsDefault: "Erbt globales Branding",
    },
    emailActions: {
      title: "Aktionen",
      requiredBadge: "Erforderlich",
      noActionSelected: "Keine Aktion ausgewählt",
      variablesTitle: "Variablen",
      variablesContextHint:
        "Ereignis-spezifische Variablen dieser Aktion. System- und Empf\u00e4nger-Variablen sind in jeder Vorlage verf\u00fcgbar.",
      variablesNone: "Keine \u2014 diese Aktion liefert nur System- und Empf\u00e4nger-Variablen.",
      boundTemplatesTitle: "Zugeordnete Vorlagen",
      noTemplateBound: "Keine Vorlage zugeordnet",
      deletedTemplateFallback: "(gelöschte Vorlage)",
      assignTemplateTitle: "Vorlage zuordnen",
      assignTemplatePlaceholder: "Vorlage wählen…",
      assignTemplateAction: "Zuordnen",
      assignTemplateNoOptions: "Keine weiteren Vorlagen verfügbar",
      bindErrorFallback: "Vorlage konnte nicht zugeordnet werden",
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
      events: "Events",
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
    unsavedGuard: {
      title: "Ungespeicherte Änderungen",
      description: "Du hast ungespeicherte Änderungen. Was möchtest du tun?",
      discard: "Verwerfen",
    },
  },
  en: {
    common: {
      ok: "OK",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving\u2026",
      saved: "Saved",
      saveError: "Error saving",
      edit: "Edit",
      delete: "Delete",
      remove: "Remove",
      duplicate: "Duplicate",
      close: "Close",
      loading: "Loading\u2026",
      copied: "Copied!",
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
        users: "Users",
        pages: "Pages",
        pagesOverview: "Overview",
        navigations: "Navigations",
        formBuilder: "Forms",
        formsOverview: "Overview",
        emailTemplates: "Email Templates",
        emailTemplatesOverview: "Overview",
        emailBranding: "Email branding",
        system: "System",
        sectionDeveloper: "Developer",
        apiAccessRequests: "API Access Requests",
        clientsAndTokens: "API Keys",
        developerAccounts: "Developer Accounts",
        services: "Services",
        design: "Design",
        actions: "Actions",
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
        artists: "Artist Profiles",
        artistEntities: "Artist Entities",
        users: "Users",
        pendingApiAccessRequests: "Pending API Requests",
      },
    },
    developer: {
      requestsTitle: "API Access Requests",
      requestsFilterAll: "All",
      requestsFilterPending: "Pending",
      requestsFilterApproved: "Approved",
      requestsFilterRejected: "Rejected",
      colApp: "App",
      colDeveloper: "Developer",
      colTraffic: "Traffic Est.",
      colSubmitted: "Submitted",
      colStatus: "Status",
      detailBackLabel: "\u2190 API Access Requests",
      detailApprove: "Approve",
      detailReject: "Reject",
      detailRejectReasonLabel: "Reason (required)",
      detailRejectReasonPlaceholder: "Reason for rejection\u2026",
      detailRejectConfirm: "Reject",
      detailRejectCancel: "Cancel",
      detailRateLimitMinute: "Requests / Minute",
      detailRateLimitDay: "Requests / Day",
      statusPending: "Pending",
      statusApproved: "Approved",
      statusRejected: "Rejected",
      statusActive: "Active",
      statusSuspended: "Suspended",
      statusRevoked: "Revoked",
      clientsTitle: "API Keys",
      clientsEmpty: "No API keys",
      clientsEmptyHint: "Approved API access requests appear here with their key.",
      clientTrafficLabel: "Configured volume",
      clientsTokensLabel: "Tokens",
      clientsNoTokens: "No tokens",
      clientsCreateToken: "Create token",
      clientsRevokeToken: "Revoke",
      clientsRotateToken: "Rotate",
      clientsDeactivateToken: "Deactivate",
      clientsSearchPlaceholder: "Search keys…",
      clientsSearchNoResults: "No results for “{q}”",
      tokenRevealTitle: "Token shown only once",
      tokenRevealHint: "Copy it now. After closing, it cannot be retrieved again.",
      tokenRevealCopy: "Copy to clipboard",
      accountsTitle: "Developer Accounts",
      colEmail: "Email",
      colDisplayName: "Name",
      colPlan: "Plan",
      colAppName: "App",
      colRegistered: "Registered",
      overviewCardLabel: "Pending API Requests",
      noRequests: "No open requests",
      noRequestsHint: "When developers request API access, they'll appear here for review.",
      requestCount: "{n} requests",
      accountCount: "{n} accounts",
      noAccounts: "No developer accounts",
      noAccountsHint: "Registered developers appear here once they sign up in the Developer Portal.",
      accountDetailTitle: "Developer Account",
      accountDetailBackLabel: "← Developer Accounts",
      accountDetailDeactivate: "Deactivate",
      accountDetailDeactivateHint:
        "Login remains possible, but the API key is blocked. The developer can only request GDPR data or delete their account.",
      accountDetailReactivate: "Reactivate",
      accountDetailDelete: "Delete",
      accountDetailDeleteHint:
        "The account and all associated data (API clients, tokens, requests) will be permanently deleted.",
      accountDetailDeleteConfirm: "Really delete account?",
      copied: "Copied!",
      descriptionLabel: "Description",
      rateLimitsLabel: "Rate Limits",
      perMinute: "/minute",
      perDay: "/day",
      colKey: "API Key",
    },
    music: {
      tracks: {
        title: "Tracks",
        searchPlaceholder: "Search tracks\u2026",
        total: "tracks",
        noTracks: "No tracks yet",
        colTitle: "Title",
        colArtists: "Artists",
        colSource: "Source",
        colLinks: "Services",
        colAdded: "Added",
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
      },
      albums: {
        title: "Albums",
        searchPlaceholder: "Search albums\u2026",
        total: "albums",
        noAlbums: "No albums yet",
        colTitle: "Title",
        colArtists: "Artists",
        colSource: "Source",
        colTracks: "Tracks",
        colLinks: "Services",
        colAdded: "Added",
      },
      artists: {
        title: "Artist Profiles",
        searchPlaceholder: "Search artist profiles\u2026",
        total: "artist profiles",
        noArtists: "No artist profiles yet",
        deleteButton: "Delete profiles ({count})",
        deleteConfirmTitle: "Delete artist profiles",
        deleteConfirmDescription:
          "{count} artist profiles will be removed. Normalized artist entities and track/album credits stay intact.",
        deleteConfirmAction: "Delete profiles",
        colName: "Name",
        colGenres: "Genres",
        colSource: "Source",
        colLinks: "Services",
        colAdded: "Added",
        refreshLabel: "Refresh",
        refreshTooltip: "Reload artist data from the source",
        refreshConfirm: "Refreshed",
      },
      table: {
        deleteButton: "Delete ({count})",
        deleteConfirmTitle: "Delete entries",
        deleteConfirmDescription: "{count} entries will be permanently deleted.",
      },
    },
    system: {
      title: "System",
      cacheTitle: "Cache",
      artistCacheLabel: "Clear artist cache",
      artistCacheDescription:
        "Deletes all cached artist info (top tracks, profile, tour dates). Will be reloaded on next request.",
      artistCacheClear: "Clear",
      shareCacheLabel: "Refresh share cache",
      shareCacheDescription:
        "Marks every track, album and artist as stale. The next request to a share re-fetches fresh source data from the services. Share URLs remain intact.",
      shareCacheClear: "Refresh",
      shareCacheSuccess: "{tracks} tracks, {albums} albums, {artists} artists refreshed.",
      genreCacheLabel: "Clear genre cache",
      genreCacheDescription:
        "Drops every generated genre artwork from the database and resets the in-memory browse-grid cache. The next `genre:?` request refetches tiles and re-renders the artworks.",
      genreCacheClear: "Clear",
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
      entriesDeleted: "{count} entries deleted.",
      trackingTitle: "Website Tracking",
      trackingLabel: "Umami Analytics",
      trackingDescription:
        "Enables the Umami tracking script on the website. When disabled, no tracking code is embedded.",
      trackingEnabled: "Active",
      trackingDisabled: "Disabled",
    },
    design: {
      title: "Design",
      description: "Website appearance — glass material, colours and night sky.",
      jsonLabel: "Design token JSON",
      jsonHint: "Paste the settings JSON exported from the prototype here and save.",
      reset: "Discard changes",
      validJson: "Valid JSON",
      invalidJson: "Invalid JSON",
      invalidValues: "{count} values out of range, defaults applied",
      reloadHint: "Changes appear on the site on its next load (up to 60 seconds).",
    },
    services: {
      title: "Services",
      subtitle:
        "Enable or disable resolve plugins. Disabled services are skipped during cross-service matching and their cached links are hidden on share pages.",
      lastServiceWarning: "At least one plugin must be enabled for resolves to work.",
      enabled: "Enabled",
      disabled: "Disabled",
      availableLabel: "Available",
      credentialsMissingLabel: "Credentials missing",
      missingEnvPrefix: "Missing:",
      capabilityTrack: "Track",
      capabilityAlbum: "Album",
      capabilityArtist: "Artist",
      capabilityIsrc: "ISRC",
      capabilityPreview: "Preview",
      capabilityArtwork: "Artwork",
      toggleAction: "Toggle",
      toggleError: "Toggle failed.",
      loadError: "Failed to load the plugin list.",
      empty: "No plugins installed.",
    },
    users: {
      title: "Users",
      inviteUser: "Invite User",
      you: "(you)",
      role: { owner: "Owner", admin: "Administrator", moderator: "Moderator" },
      removeConfirmTitle: "Remove User",
      removeConfirmDescription: "Are you sure you want to remove this user?",
      createCard: {
        title: "Invite User",
        role: "Role",
        username: "Username",
        email: "Email",
        inviteFlowHint: "The user will receive an invitation link.",
        inviteCreated: "Invitation Created",
        inviteHint: "Share the following link with the user:",
        inviteLink: "Invitation Link",
        copyInvite: "Copy Link",
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
      },
    },
    content: {
      editor: {
        decreaseFontSize: "Decrease font size",
        increaseFontSize: "Increase font size",
        deletePage: "Delete page",
        confirmDelete: "Really delete?",
        pageTitleLabel: "Page title",
        slugLabel: "Slug",
        statusLabel: "Status",
        statusDraft: "Draft",
        statusPublished: "Published",
        statusHidden: "Hidden",
        showTitleLabel: "Show title",
        titleAlignmentLabel: "Alignment",
        titleAlignmentLeft: "Left",
        titleAlignmentCenter: "Center",
        titleAlignmentRight: "Right",
        createdBy: "Created by",
        updatedBy: "Updated by",
        updatedAt: "Updated at",
        loadingContent: "Loading content\u2026",
        preview: "Preview",
      },
      pages: {
        title: "Pages",
        newPage: "New Page",
        createTitle: "Create Page",
        fieldTitle: "Title",
        fieldSlug: "Slug",
        fieldPageType: "Page type",
        pageTypeDefault: "Default",
        pageTypeSegmented: "Segmented",
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
        display: {
          displayMode: "Display",
          fullscreen: "Fullscreen",
          embossed: "Embossed overlay",
          translucent: "Translucent overlay",
          overlayWidth: "Width",
          widthSmall: "Small",
          widthRegular: "Regular",
          widthBig: "Big",
          contentCardStyle: "Card style",
          cardStyleDefault: "Direct",
          cardStyleRecessed: "Recessed",
        },
        segments: {
          title: "Segments",
          empty: "No segments yet.",
          labelPlaceholder: "Label",
        },
        table: {
          title: "Title",
          slug: "Slug",
          status: "Status",
          type: "Type",
          createdBy: "Created by",
          updatedAt: "Updated at",
          translations: "Translations",
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
      slugLabel: "Slug",
      slugPlaceholder: "form-slug",
      empty: "Drag fields into the form",
      noForms: "No forms yet",
      noFormsHint: "Create a new form.",
      slugConflict: "Slug already taken",
      nameConflict: "Name already taken",
      noFieldSelected: "No field selected",
      noFieldSelectedHint: "Select a field to edit it.",
      canvasTitle: "Form",
      paletteTitle: "Fields",
      preferencesTitle: "Settings",
      exportForm: "Export",
      exportUnsavedWarning: "Save before exporting.",
      importForm: "Import",
      importSuccess: "{n} forms imported",
      importError: "Import failed",
      importInvalidFile: "Invalid file",
      importConflictTitle: "Form \u201c{name}\u201d already exists",
      importConflictHint: "Choose how to handle the existing form.",
      importNewNameLabel: "New name",
      importOverwrite: "Overwrite",
      importRename: "Rename",
      importSkip: "Skip",
      noLabel: "No label",
      fieldTypes: {
        text: "Input",
        email: "Email",
        textarea: "Text area",
        select: "Select",
        multiSelect: "Multi-select",
        checkbox: "Checkbox",
        richtext: "Markdown",
        button: "Button",
        password: "Password",
        headline: "Heading",
        separator: "Separator",
        paragraph: "Paragraph",
      },
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
        buttonDisplay: "Display",
        headlineLevel: "Heading Level",
        headlineLevelH1: "Heading 1",
        headlineLevelH2: "Heading 2",
        headlineLevelH3: "Heading 3",
        separatorNoSettings: "No settings",
        inputType: "Input type",
        inputTypeText: "Text",
        inputTypeEmail: "Email",
        inputTypePassword: "Password",
        inputTypeUrl: "URL",
        inputTypeTel: "Phone",
        inputTypeDate: "Date",
        inputTypeNumber: "Number",
        buttonAction: "Button action",
        buttonActionNone: "None",
        buttonActionOpenUrl: "Open URL",
        buttonActionCopyClipboard: "Copy to clipboard",
        buttonActionClearField: "Clear field",
        buttonActionSourceField: "Source field",
        validation: "Validation",
        spanAriaOf: "of",
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
        emailReplyTo: "Reply-To",
        emailReplyToNone: "None",
        successText: "Text",
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
      templateName: "Name",
      templateSubject: "Subject",
      subjectPlaceholder: "Email subject",
      bodyText: "Body",
      deleteTemplate: "Delete Template",
      deleteTemplateConfirm: "Really delete?",
      noTemplates: "No templates yet",
      noTemplatesHint: "Create a new email template.",
      nameConflict: "Name already taken",
      systemBadge: "System",
      tableCreated: "Created",
      preview: "Preview",
      previewTitle: "Email Preview",
      blocksTitle: "Body",
      blockTypeText: "Text",
      blockTypeButton: "Button",
      blockTypeImage: "Image",
      blockTypeDivider: "Divider",
      blockTypeSpacer: "Spacer",
      buttonLabel: "Label",
      buttonUrl: "Target URL",
      imageUpload: "Upload image",
      imageUploadError: "Failed to upload image",
      imageAltText: "Alt text",
      spacerHeight: "Height (px)",
      variablesTitle: "Variables",
      variablesInsertHint: "Click to insert the placeholder at the cursor position.",
      variablesGroupSystem: "System",
      variablesGroupRecipient: "Recipient",
      variablesGroupContext: "Action",
      variablesContextUnbound: "Action variables appear once the template is bound to an action.",
      variablesDetectedTitle: "Used in this template",
      variablesDetectedEmpty: "None — this template uses no {{placeholders}}.",
      variablesUnknownWarning:
        "Unknown variables — they will not be filled when sending (typo or missing action binding).",
      exportTemplate: "Export",
      exportAll: "Export all",
      importTemplate: "Import",
      importSuccess: "{n} templates imported",
      importError: "Import failed",
      importInvalidFile: "Invalid file",
      importConflictTitle: "Template \u201c{name}\u201d already exists",
      importConflictHint: "Choose how to handle the existing template.",
      importNewNameLabel: "New name",
      importOverwrite: "Overwrite",
      importRename: "Rename",
      importSkip: "Skip",
      sendTest: "Send test email",
      sendingTest: "Sending\u2026",
      testSent: "Test email sent to {email}",
      testFailed: "Test email failed",
      brandingTitle: "Email branding",
      brandingDescription:
        "The header/footer image, footer text and day/night background are the global default for every sent template \u2014 individual templates can override any field.",
      brandingHeaderImage: "Header image",
      brandingImageHint:
        "JPEG, PNG or WebP, max 5 MB. Scaled to 560px wide — recommended: about 1120px wide (2× for retina sharpness), wide banner format.",
      brandingFooterText: "Footer text",
      brandingFooterTextPlaceholder: "Markdown text shown below every template",
      brandingLightBackground: "Day background",
      brandingDarkBackground: "Night background",
      brandingBackgroundHint:
        "Always a gradient, optionally with an image layered on top. Shown in mail clients with a light or dark colour scheme respectively.",
      brandingGradientTop: "Gradient top",
      brandingGradientBottom: "Gradient bottom",
      brandingGradientImage: "Background image (optional)",
      brandingGradientPresets: "Previously used",
      assetPickerTitle: "Choose image",
      assetPickerChoose: "Choose image",
      assetPickerChange: "Change image",
      assetPickerUploadNew: "Upload new",
      assetPickerExisting: "Already uploaded",
      assetPickerEmpty: "No images uploaded yet",
      brandingOverrideTitle: "Branding",
      brandingOverrideHint: "Per field, use the global default or override it for this template.",
      brandingModeDefault: "Default",
      brandingModeOverride: "Override",
      brandingInheritsDefault: "Inherits global branding",
    },
    emailActions: {
      title: "Actions",
      requiredBadge: "Required",
      noActionSelected: "No action selected",
      variablesTitle: "Variables",
      variablesContextHint:
        "Event-specific variables of this action. System and recipient variables are available in every template.",
      variablesNone: "None — this action only provides system and recipient variables.",
      boundTemplatesTitle: "Bound templates",
      noTemplateBound: "No template bound",
      deletedTemplateFallback: "(deleted template)",
      assignTemplateTitle: "Bind template",
      assignTemplatePlaceholder: "Choose a template…",
      assignTemplateAction: "Bind",
      assignTemplateNoOptions: "No further templates available",
      bindErrorFallback: "Could not bind template",
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
      events: "Events",
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
    unsavedGuard: {
      title: "Unsaved changes",
      description: "You have unsaved changes. What would you like to do?",
      discard: "Discard",
    },
  },
};
