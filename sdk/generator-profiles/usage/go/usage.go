package goldenusage

import "context"

type SharePayload struct{}
type SharePreviewPayload struct{}

type SharesService interface {
	Get(ctx context.Context, shortID string) (SharePayload, error)
	RefreshPreview(ctx context.Context, shortID string) (SharePreviewPayload, error)
}

type Client struct {
	Shares SharesService
}

func ShareQuickstart(
	ctx context.Context,
	client *Client,
	shortID string,
) (SharePayload, SharePreviewPayload, error) {
	share, err := client.Shares.Get(ctx, shortID)
	if err != nil {
		return SharePayload{}, SharePreviewPayload{}, err
	}
	preview, err := client.Shares.RefreshPreview(ctx, shortID)
	return share, preview, err
}
