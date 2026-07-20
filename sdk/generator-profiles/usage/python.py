from typing import Protocol


class SharesResource(Protocol):
    def retrieve(self, short_id: str) -> object: ...

    def refresh_preview(self, short_id: str) -> object: ...


class MusicCloud(Protocol):
    shares: SharesResource


def share_quickstart(client: MusicCloud, short_id: str) -> tuple[object, object]:
    share = client.shares.retrieve(short_id)
    preview = client.shares.refresh_preview(short_id)
    return share, preview
