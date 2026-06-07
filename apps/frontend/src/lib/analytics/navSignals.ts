import { type NavItem, NavTarget } from "@musiccloud/shared";
import { MusicInteractionAction, type MusicInteractionSurface, sendMusicSignal } from "@/lib/analytics/umami";

const NavKind = {
  ContentPage: "content_page",
  ExternalUrl: "external_url",
  Placeholder: "placeholder",
} as const;

const ContentPageActionBySlug: Record<string, (typeof MusicInteractionAction)[keyof typeof MusicInteractionAction]> = {
  help: MusicInteractionAction.HelpPageClicked,
  info: MusicInteractionAction.InfoPageClicked,
};

export function sendNavInteractionSignal(
  item: NavItem,
  surface: (typeof MusicInteractionSurface)[keyof typeof MusicInteractionSurface],
): void {
  const slug = item.pageSlug ?? undefined;
  const action = slug
    ? (ContentPageActionBySlug[slug] ?? MusicInteractionAction.ContentPageClicked)
    : MusicInteractionAction.ExternalNavClicked;
  const navKind = slug ? NavKind.ContentPage : item.url ? NavKind.ExternalUrl : NavKind.Placeholder;

  sendMusicSignal("music_interaction", {
    action,
    nav_kind: navKind,
    nav_target: item.target === NavTarget.Blank ? NavTarget.Blank : "same_tab",
    page_slug: slug,
    surface,
  });
}
