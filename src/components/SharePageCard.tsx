/**
 * SharePageCard – React island for the share page (/[shortId]).
 *
 * Wraps MediaCard with a ShareContentConfiguration. The config is passed
 * as a plain JSON-serializable prop from the Astro SSR page so no
 * client-side data fetching is needed.
 *
 * No LocaleProvider needed: PlatformButton does not use useT().
 */
import { MediaCard, type ShareContentConfiguration } from "./MediaCard";

interface SharePageCardProps {
  config: ShareContentConfiguration;
}

export function SharePageCard({ config }: SharePageCardProps) {
  return <MediaCard content={config} animated={false} />;
}
