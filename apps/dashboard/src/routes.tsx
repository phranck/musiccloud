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
  ApiAccessRequestsPage,
  ApiClientsPage,
  ArtistsPage,
  ClientDetailPage,
  ContentEditorPage,
  DashboardPage,
  DesignSettingsPage,
  DeveloperAccountsPage,
  DeveloperDetailPage,
  EmailActionsPage,
  EmailBrandingPage,
  EmailTemplateEditPage,
  EmailTemplateListPage,
  FormBuilderEditPage,
  FormBuilderListPage,
  InvitePage,
  LoginPage,
  NavManagerPage,
  PagesListPage,
  RequestDetailPage,
  ServicesPage,
  SetupPage,
  SystemPage,
  TierEditorPage,
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
          <Route path="forms/:name" element={lazyFallback(<FormBuilderEditPage />)} />
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
          <Route path="developer/requests" element={lazyFallback(<ApiAccessRequestsPage />)} />
          <Route path="developer/requests/:id" element={lazyFallback(<RequestDetailPage />)} />
          <Route path="developer/clients" element={lazyFallback(<ApiClientsPage />)} />
          <Route path="developer/clients/:id" element={lazyFallback(<ClientDetailPage />)} />
          <Route path="developer/accounts" element={lazyFallback(<DeveloperAccountsPage />)} />
          <Route path="developer/accounts/:id" element={lazyFallback(<DeveloperDetailPage />)} />
          <Route path="developer/tiers" element={lazyFallback(<TierEditorPage />)} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Route>,
);
