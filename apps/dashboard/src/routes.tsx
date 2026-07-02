import { type ReactNode, Suspense } from "react";
import { createRoutesFromElements, Navigate, Route } from "react-router";

import { ContentEditorLoadingFallback } from "@/components/ContentEditorLoadingFallback";
import { RedirectIfAuthed } from "@/features/auth/RedirectIfAuthed";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { RequireNonModerator } from "@/features/auth/RequireNonModerator";
import { RequireOwner } from "@/features/auth/RequireOwner";
import { SetupGate } from "@/features/auth/SetupGate";
import { RootLayout } from "@/RootLayout";
import {
  AdminLayout,
  AlbumsPage,
  AnalyticsPage,
  ArtistsPage,
  ContentEditorPage,
  DashboardPage,
  DesignSettingsPage,
  EditorStubPage,
  EmailBrandingPage,
  EmailTemplateEditPage,
  EmailTemplateListPage,
  FormBuilderListPage,
  InvitePage,
  LoginPage,
  NavManagerPage,
  PagesListPage,
  ServicesPage,
  SetupPage,
  SystemPage,
  TrackEditPage,
  TracksPage,
  UsersPage,
} from "@/routeComponents";

function lazyFallback(node: ReactNode) {
  return <Suspense fallback={<ContentEditorLoadingFallback />}>{node}</Suspense>;
}

export const routes = createRoutesFromElements(
  <Route element={<RootLayout />}>
    <Route path="/setup" element={<SetupGate>{lazyFallback(<SetupPage />)}</SetupGate>} />
    <Route path="/invite/:token" element={<RedirectIfAuthed>{lazyFallback(<InvitePage />)}</RedirectIfAuthed>} />
    <Route path="/login" element={<RedirectIfAuthed>{lazyFallback(<LoginPage />)}</RedirectIfAuthed>} />

    <Route element={<RequireAuth />}>
      <Route element={lazyFallback(<AdminLayout />)}>
        <Route index element={lazyFallback(<DashboardPage />)} />

        <Route path="tracks" element={lazyFallback(<TracksPage />)} />
        <Route path="tracks/:id" element={lazyFallback(<TrackEditPage />)} />
        <Route path="albums" element={lazyFallback(<AlbumsPage />)} />
        <Route path="artists" element={lazyFallback(<ArtistsPage />)} />

        <Route element={<RequireOwner />}>
          <Route path="users" element={lazyFallback(<UsersPage />)} />
        </Route>

        <Route element={<RequireNonModerator />}>
          <Route path="analytics" element={lazyFallback(<AnalyticsPage />)} />
          <Route path="forms" element={lazyFallback(<FormBuilderListPage />)} />
          <Route path="forms/:name" element={lazyFallback(<EditorStubPage />)} />
          <Route path="email-templates" element={lazyFallback(<EmailTemplateListPage />)} />
          <Route path="email-templates/new" element={lazyFallback(<EmailTemplateEditPage />)} />
          <Route path="email-templates/:id" element={lazyFallback(<EmailTemplateEditPage />)} />
          <Route path="email-branding" element={lazyFallback(<EmailBrandingPage />)} />
          <Route path="pages" element={lazyFallback(<PagesListPage />)} />
          <Route path="pages/:slug" element={lazyFallback(<ContentEditorPage />)} />
          <Route path="navigation" element={lazyFallback(<NavManagerPage />)} />
          <Route path="system" element={lazyFallback(<SystemPage />)} />
          <Route path="services" element={lazyFallback(<ServicesPage />)} />
          <Route path="design" element={lazyFallback(<DesignSettingsPage />)} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Route>,
);
