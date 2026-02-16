import type { ServiceId } from "./types";

export interface OdesliLink {
  url: string;
  entityUniqueId: string;
}

export interface OdesliResult {
  links: Partial<Record<ServiceId, OdesliLink>>;
  metadata?: {
    title?: string;
    artistName?: string;
    thumbnailUrl?: string;
  };
}

const ODESLI_BASE = "https://api.song.link/v1-alpha.1/links";

export async function resolveViaOdesli(url: string): Promise<OdesliResult> {
  const apiKey = import.meta.env.ODESLI_API_KEY;
  const params = new URLSearchParams({ url });
  if (apiKey) params.set("key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(`${ODESLI_BASE}?${params}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Odesli returned ${response.status}`);
  }

  const data = await response.json();

  const links: Partial<Record<ServiceId, OdesliLink>> = {};
  const platformMap: Record<string, ServiceId> = {
    spotify: "spotify",
    appleMusic: "apple-music",
    youtube: "youtube",
    youtubeMusic: "youtube",
    soundcloud: "soundcloud",
  };

  if (data.linksByPlatform) {
    for (const [platform, info] of Object.entries(data.linksByPlatform)) {
      const serviceId = platformMap[platform];
      if (serviceId && info && typeof info === "object") {
        const linkInfo = info as { url: string; entityUniqueId: string };
        links[serviceId] = {
          url: linkInfo.url,
          entityUniqueId: linkInfo.entityUniqueId,
        };
      }
    }
  }

  let metadata: OdesliResult["metadata"];
  if (data.entitiesByUniqueId) {
    const firstEntity = Object.values(data.entitiesByUniqueId)[0] as Record<string, unknown> | undefined;
    if (firstEntity) {
      metadata = {
        title: firstEntity.title as string | undefined,
        artistName: firstEntity.artistName as string | undefined,
        thumbnailUrl: firstEntity.thumbnailUrl as string | undefined,
      };
    }
  }

  return { links, metadata };
}
