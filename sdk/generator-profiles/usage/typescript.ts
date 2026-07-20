export interface SharesResource {
  retrieve(shortId: string): Promise<unknown>;
  refreshPreview(shortId: string): Promise<unknown>;
}

export interface MusicCloudClient {
  readonly shares: SharesResource;
}

export async function shareQuickstart(client: MusicCloudClient, shortId: string) {
  const share = await client.shares.retrieve(shortId);
  const preview = await client.shares.refreshPreview(shortId);
  return { share, preview };
}
