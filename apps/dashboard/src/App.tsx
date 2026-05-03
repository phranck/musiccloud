import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

import { ContentEditorLoadingFallback } from "@/components/ContentEditorLoadingFallback";
import { I18nProvider } from "@/context/I18nContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { KeyboardSaveProvider } from "@/lib/useKeyboardSave";

const AdminLayout = lazy(() =>
  import("@/components/layout/AdminLayout").then((m) => ({
    default: m.AdminLayout,
  })),
);

const InvitePage = lazy(() =>
  import("@/features/auth/InvitePage").then((m) => ({
    default: m.InvitePage,
  })),
);

const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({
    default: m.LoginPage,
  })),
);

const SetupPage = lazy(() =>
  import("@/features/auth/SetupPage").then((m) => ({
    default: m.SetupPage,
  })),
);

const DashboardPage = lazy(() =>
  import("@/features/overview/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

const TracksPage = lazy(() =>
  import("@/features/music/TracksPage").then((m) => ({
    default: m.TracksPage,
  })),
);

const TrackEditPage = lazy(() =>
  import("@/features/music/TrackEditPage").then((m) => ({
    default: m.TrackEditPage,
  })),
);

const AlbumsPage = lazy(() =>
  import("@/features/music/AlbumsPage").then((m) => ({
    default: m.AlbumsPage,
  })),
);

const ArtistsPage = lazy(() =>
  import("@/features/music/ArtistsPage").then((m) => ({
    default: m.ArtistsPage,
  })),
);

const UsersPage = lazy(() =>
  import("@/features/system/UsersPage").then((m) => ({
    default: m.UsersPage,
  })),
);

const AnalyticsPage = lazy(() =>
  import("@/features/analytics/AnalyticsPage").then((m) => ({
    default: m.AnalyticsPage,
  })),
);

const PagesListPage = lazy(() =>
  import("@/features/content/pages/PagesListPage").then((m) => ({
    default: m.PagesListPage,
  })),
);

const ContentEditorPage = lazy(() =>
  import("@/features/content/pages/ContentEditorPage").then((m) => ({
    default: m.ContentEditorPage,
  })),
);

const NavManagerPage = lazy(() =>
  import("@/features/content/navigation/NavManagerPage").then((m) => ({
    default: m.NavManagerPage,
  })),
);

const FormBuilderListPage = lazy(() =>
  import("@/features/templates/form-builder/FormBuilderListPage").then((m) => ({
    default: m.FormBuilderListPage,
  })),
);

const EmailTemplateListPage = lazy(() =>
  import("@/features/templates/email-templates/EmailTemplateListPage").then((m) => ({
    default: m.EmailTemplateListPage,
  })),
);

const EmailTemplateEditPage = lazy(() =>
  import("@/features/templates/email-templates/EmailTemplateEditPage").then((m) => ({
    default: m.EmailTemplateEditPage,
  })),
);

const MarkdownWidgetsPage = lazy(() =>
  import("@/features/system/MarkdownWidgetsPage").then((m) => ({
    default: m.MarkdownWidgetsPage,
  })),
);

const SystemPage = lazy(() =>
  import("@/features/system/SystemPage").then((m) => ({
    default: m.SystemPage,
  })),
);

const ServicesPage = lazy(() =>
  import("@/features/services/ServicesPage").then((m) => ({
    default: m.ServicesPage,
  })),
);

// Stub for complex editor pages not yet ported (require MarkdownEditor, dnd-kit, etc.)
const EditorStubPage = lazy(() =>
  Promise.resolve({
    default: () => (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--ds-text-muted)]">Editor coming soon</p>
      </div>
    ),
  }),
);

function AppRoutes() {
  const { user, isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/setup"
        element={
          needsSetup ? (
            <Suspense fallback={<ContentEditorLoadingFallback />}>
              <SetupPage />
            </Suspense>
          ) : (
            <Navigate to={user ? "/" : "/login"} replace />
          )
        }
      />
      <Route
        path="/invite/:token"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <Suspense fallback={<ContentEditorLoadingFallback />}>
              <InvitePage />
            </Suspense>
          )
        }
      />
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <Suspense fallback={<ContentEditorLoadingFallback />}>
              <LoginPage />
            </Suspense>
          )
        }
      />

      {user ? (
        <Route
          element={
            <Suspense fallback={<ContentEditorLoadingFallback />}>
              <AdminLayout />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <DashboardPage />
              </Suspense>
            }
          />
          {/* Music */}
          <Route
            path="tracks"
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <TracksPage />
              </Suspense>
            }
          />
          <Route
            path="tracks/:id"
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <TrackEditPage />
              </Suspense>
            }
          />
          <Route
            path="albums"
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <AlbumsPage />
              </Suspense>
            }
          />
          <Route
            path="artists"
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <ArtistsPage />
              </Suspense>
            }
          />
          {/* System (owner-only) */}
          {user.isOwner && (
            <Route
              path="users"
              element={
                <Suspense fallback={<ContentEditorLoadingFallback />}>
                  <UsersPage />
                </Suspense>
              }
            />
          )}
          {user.role !== "moderator" && (
            <>
              <Route
                path="analytics"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <AnalyticsPage />
                  </Suspense>
                }
              />
              <Route
                path="forms"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <FormBuilderListPage />
                  </Suspense>
                }
              />
              <Route
                path="forms/:name"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <EditorStubPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <EmailTemplateListPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates/new"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <EmailTemplateEditPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates/:id"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <EmailTemplateEditPage />
                  </Suspense>
                }
              />
              <Route
                path="pages"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PagesListPage />
                  </Suspense>
                }
              />
              <Route
                path="pages/:slug"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <ContentEditorPage />
                  </Suspense>
                }
              />
              <Route
                path="navigation"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <NavManagerPage />
                  </Suspense>
                }
              />
              <Route
                path="markdown-widgets"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <MarkdownWidgetsPage />
                  </Suspense>
                }
              />
              <Route
                path="system"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <SystemPage />
                  </Suspense>
                }
              />
              <Route
                path="services"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <ServicesPage />
                  </Suspense>
                }
              />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to={needsSetup ? "/setup" : "/login"} replace />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <ThemeProvider>
          <KeyboardSaveProvider>
            <AppRoutes />
          </KeyboardSaveProvider>
        </ThemeProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
