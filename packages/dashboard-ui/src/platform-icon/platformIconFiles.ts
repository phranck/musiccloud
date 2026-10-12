import { Service, type ServiceId } from "@musiccloud/shared";

/**
 * The image files the platform icon draws, by service. They are addressed
 * root-relative under `/icons/`, so every app that renders `PlatformIcon`
 * serves each of these files from its own `public/icons`.
 */
export const PLATFORM_ICON_FILES = {
  [Service.Spotify]: "spotify.svg",
  [Service.SoundCloud]: "soundcloud.svg",
  [Service.Deezer]: "deezer.svg",
  [Service.Qobuz]: "qobuz.svg",
  [Service.Boomplay]: "boomplay.png",
  [Service.NetEase]: "netease.png",
  [Service.Jamendo]: "jamendo.svg",
} as const satisfies Partial<Record<ServiceId, string>>;
