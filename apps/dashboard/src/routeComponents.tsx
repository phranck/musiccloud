import { lazy } from "react";

export const AdminLayout = lazy(() =>
  import("@/components/layout/AdminLayout").then((m) => ({
    default: m.AdminLayout,
  })),
);

export const InvitePage = lazy(() =>
  import("@/features/auth/InvitePage").then((m) => ({
    default: m.InvitePage,
  })),
);

export const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({
    default: m.LoginPage,
  })),
);

export const SetupPage = lazy(() =>
  import("@/features/auth/SetupPage").then((m) => ({
    default: m.SetupPage,
  })),
);

export const DashboardPage = lazy(() =>
  import("@/features/overview/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

export const TracksPage = lazy(() =>
  import("@/features/music/TracksPage").then((m) => ({
    default: m.TracksPage,
  })),
);

export const TrackEditPage = lazy(() =>
  import("@/features/music/TrackEditPage").then((m) => ({
    default: m.TrackEditPage,
  })),
);

export const AlbumsPage = lazy(() =>
  import("@/features/music/AlbumsPage").then((m) => ({
    default: m.AlbumsPage,
  })),
);

export const ArtistsPage = lazy(() =>
  import("@/features/music/ArtistsPage").then((m) => ({
    default: m.ArtistsPage,
  })),
);

export const ArtistEntitiesPage = lazy(() =>
  import("@/features/music/ArtistEntitiesPage").then((m) => ({
    default: m.ArtistEntitiesPage,
  })),
);

export const ArtistEntityDetailPage = lazy(() =>
  import("@/features/music/ArtistEntityDetailPage").then((m) => ({
    default: m.ArtistEntityDetailPage,
  })),
);

export const UsersPage = lazy(() =>
  import("@/features/system/UsersPage").then((m) => ({
    default: m.UsersPage,
  })),
);

export const PagesListPage = lazy(() =>
  import("@/features/content/pages/PagesListPage").then((m) => ({
    default: m.PagesListPage,
  })),
);

export const ContentEditorPage = lazy(() =>
  import("@/features/content/pages/ContentEditorPage").then((m) => ({
    default: m.ContentEditorPage,
  })),
);

export const NavManagerPage = lazy(() =>
  import("@/features/content/navigation/NavManagerPage").then((m) => ({
    default: m.NavManagerPage,
  })),
);

export const EmailTemplateListPage = lazy(() =>
  import("@/features/templates/email-templates/EmailTemplateListPage").then((m) => ({
    default: m.EmailTemplateListPage,
  })),
);

export const EmailTemplateEditPage = lazy(() =>
  import("@/features/templates/email-templates/EmailTemplateEditPage").then((m) => ({
    default: m.EmailTemplateEditPage,
  })),
);

export const EmailBrandingPage = lazy(() =>
  import("@/features/templates/email-templates/EmailBrandingPage").then((m) => ({
    default: m.EmailBrandingPage,
  })),
);

export const SystemPage = lazy(() =>
  import("@/features/system/SystemPage").then((m) => ({
    default: m.SystemPage,
  })),
);

export const EmailActionsPage = lazy(() =>
  import("@/features/system/EmailActionsPage").then((m) => ({
    default: m.EmailActionsPage,
  })),
);

export const DesignSettingsPage = lazy(() =>
  import("@/features/system/DesignSettingsPage").then((m) => ({
    default: m.DesignSettingsPage,
  })),
);

export const ServicesPage = lazy(() =>
  import("@/features/services/ServicesPage").then((m) => ({
    default: m.ServicesPage,
  })),
);

export const ProjectDetailPage = lazy(() =>
  import("@/features/developer/ProjectDetailPage").then((m) => ({
    default: m.ProjectDetailPage,
  })),
);

export const ApiClientsPage = lazy(() =>
  import("@/features/developer/ApiClientsPage").then((m) => ({
    default: m.ApiClientsPage,
  })),
);

export const DeveloperAccountsPage = lazy(() =>
  import("@/features/developer/DeveloperAccountsPage").then((m) => ({
    default: m.DeveloperAccountsPage,
  })),
);

export const ClientDetailPage = lazy(() =>
  import("@/features/developer/ClientDetailPage").then((m) => ({
    default: m.ClientDetailPage,
  })),
);

export const DeveloperDetailPage = lazy(() =>
  import("@/features/developer/DeveloperDetailPage").then((m) => ({
    default: m.DeveloperDetailPage,
  })),
);

export const PlanDetailPage = lazy(() =>
  import("@/features/developer/PlanDetailPage").then((m) => ({
    default: m.PlanDetailPage,
  })),
);

export const TierEditorPage = lazy(() =>
  import("@/features/developer/TierEditorPage").then((m) => ({
    default: m.TierEditorPage,
  })),
);

export const SponsoringSettingsPage = lazy(() =>
  import("@/features/sponsoring/SponsoringSettingsPage").then((m) => ({
    default: m.SponsoringSettingsPage,
  })),
);

export const DonationsPage = lazy(() =>
  import("@/features/sponsoring/DonationsPage").then((m) => ({
    default: m.DonationsPage,
  })),
);

export const SponsorsPage = lazy(() =>
  import("@/features/sponsoring/SponsorsPage").then((m) => ({
    default: m.SponsorsPage,
  })),
);

export const SponsorshipRequestsPage = lazy(() =>
  import("@/features/sponsoring/SponsorshipRequestsPage").then((m) => ({
    default: m.SponsorshipRequestsPage,
  })),
);

/** The support prompt list with the limits that bound all of them, loaded when first opened. */
export const SupportPromptsPage = lazy(() =>
  import("@/features/sponsoring/SupportPromptsPage").then((m) => ({
    default: m.SupportPromptsPage,
  })),
);

/** The editor of one support prompt, loaded when first opened. */
export const SupportPromptEditorPage = lazy(() =>
  import("@/features/sponsoring/SupportPromptEditorPage").then((m) => ({
    default: m.SupportPromptEditorPage,
  })),
);

/** The bank account whose payments musiccloud counts, loaded when first opened. */
export const BankConnectionPage = lazy(() =>
  import("@/features/sponsoring/BankConnectionPage").then((m) => ({
    default: m.BankConnectionPage,
  })),
);

/** Where the bank returns the account holder, loaded when first opened. */
export const BankConnectionCallbackPage = lazy(() =>
  import("@/features/sponsoring/BankConnectionCallbackPage").then((m) => ({
    default: m.BankConnectionCallbackPage,
  })),
);

export const IncomePage = lazy(() =>
  import("@/features/sponsoring/IncomePage").then((m) => ({
    default: m.IncomePage,
  })),
);

export const DeveloperSettingsPage = lazy(() =>
  import("@/features/developer/DeveloperSettingsPage").then((m) => ({
    default: m.DeveloperSettingsPage,
  })),
);
