import { type ReactNode, Suspense } from "react";
import { createRoutesFromElements, Navigate, Route } from "react-router";

import { ContentEditorLoadingFallback } from "@/components/ContentEditorLoadingFallback";
import { RedirectIfAuthed } from "@/features/auth/RedirectIfAuthed";
import { RequireArea } from "@/features/auth/RequireArea";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { SetupGate } from "@/features/auth/SetupGate";
import { RootLayout } from "@/RootLayout";
import {
  AdminLayout,
  AlbumsPage,
  ApiClientsPage,
  ArtistEntitiesPage,
  ArtistEntityDetailPage,
  ArtistsPage,
  ClientDetailPage,
  ContentEditorPage,
  DashboardPage,
  DesignSettingsPage,
  DeveloperAccountsPage,
  DeveloperDetailPage,
  DeveloperSettingsPage,
  EmailActionsPage,
  EmailBrandingPage,
  EmailTemplateEditPage,
  EmailTemplateListPage,
  InvitePage,
  LoginPage,
  NavManagerPage,
  PagesListPage,
  PlanDetailPage,
  ProjectDetailPage,
  ServicesPage,
  SetupPage,
  SystemPage,
  TierEditorPage,
  TrackEditPage,
  TracksPage,
  UsersPage,
} from "@/routeComponents";
import { AdminArea } from "@/shared/constants/domain";

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
        <Route path="artist-entities" element={lazyFallback(<ArtistEntitiesPage />)} />
        <Route path="artist-entities/:id" element={lazyFallback(<ArtistEntityDetailPage />)} />

        <Route element={<RequireArea area={AdminArea.Users} />}>
          <Route path="users" element={lazyFallback(<UsersPage />)} />
        </Route>

        <Route element={<RequireArea area={AdminArea.DeveloperSettings} />}>
          <Route path="developer/settings" element={lazyFallback(<DeveloperSettingsPage />)} />
        </Route>

        <Route element={<RequireArea area={AdminArea.Administration} />}>
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
          <Route path="actions" element={lazyFallback(<EmailActionsPage />)} />
          <Route path="developer/clients" element={lazyFallback(<ApiClientsPage />)} />
          <Route path="developer/clients/:id" element={lazyFallback(<ClientDetailPage />)} />
          <Route path="developer/accounts" element={lazyFallback(<DeveloperAccountsPage />)} />
          <Route path="developer/accounts/:id" element={lazyFallback(<DeveloperDetailPage />)} />
          <Route path="developer/projects/:id" element={lazyFallback(<ProjectDetailPage />)} />
          <Route path="developer/plans" element={lazyFallback(<TierEditorPage />)} />
          <Route path="developer/plans/:id" element={lazyFallback(<PlanDetailPage />)} />
          {/* The screen was reached at /developer/tiers until the wording moved
              to "plan". A bookmark on the old path would otherwise fall into
              the catch-all and land on the dashboard root, which loses the
              destination without saying so. */}
          <Route path="developer/tiers" element={<Navigate to="/developer/plans" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Route>,
);
