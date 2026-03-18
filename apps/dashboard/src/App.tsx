import { Suspense, lazy } from "react";
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

const TracksPage = lazy(() =>
  import("@/features/music/TracksPage").then((m) => ({
    default: m.TracksPage,
  })),
);

const AlbumsPage = lazy(() =>
  import("@/features/music/AlbumsPage").then((m) => ({
    default: m.AlbumsPage,
  })),
);

const SystemPage = lazy(() =>
  import("@/features/system/SystemPage").then((m) => ({
    default: m.SystemPage,
  })),
);

// Placeholder for pages not yet implemented (Phase 4+)
const PlaceholderPage = lazy(() =>
  Promise.resolve({
    default: () => (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--ds-text-muted)]">Coming soon</p>
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
                <PlaceholderPage />
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
            path="albums"
            element={
              <Suspense fallback={<ContentEditorLoadingFallback />}>
                <AlbumsPage />
              </Suspense>
            }
          />
          {/* System (owner-only) */}
          {user.isOwner && (
            <Route
              path="users"
              element={
                <Suspense fallback={<ContentEditorLoadingFallback />}>
                  <PlaceholderPage />
                </Suspense>
              }
            />
          )}
          {user.role !== "moderator" && (
            <>
              <Route
                path="media"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="analytics"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="forms"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="forms/:name"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates/new"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="email-templates/:id"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="pages"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="pages/navigations"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="pages/:slug"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="markdown-widgets"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="footer-builder"
                element={
                  <Suspense fallback={<ContentEditorLoadingFallback />}>
                    <PlaceholderPage />
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
