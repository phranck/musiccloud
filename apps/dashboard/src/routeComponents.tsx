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

export const UsersPage = lazy(() =>
  import("@/features/system/UsersPage").then((m) => ({
    default: m.UsersPage,
  })),
);

export const AnalyticsPage = lazy(() =>
  import("@/features/analytics/AnalyticsPage").then((m) => ({
    default: m.AnalyticsPage,
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

export const FormBuilderListPage = lazy(() =>
  import("@/features/templates/form-builder/FormBuilderListPage").then((m) => ({
    default: m.FormBuilderListPage,
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

export function EditorStubPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[var(--ds-text-muted)]">Editor coming soon</p>
    </div>
  );
}
