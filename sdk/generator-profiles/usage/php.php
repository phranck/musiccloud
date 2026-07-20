<?php

declare(strict_types=1);

namespace MusicCloud\GoldenUsage;

interface SharesResource
{
    public function retrieve(string $shortId): mixed;

    public function refreshPreview(string $shortId): mixed;
}

interface MusicCloudClient
{
    public function shares(): SharesResource;
}

/** @return array{share: mixed, preview: mixed} */
function shareQuickstart(MusicCloudClient $client, string $shortId): array
{
    $share = $client->shares()->retrieve($shortId);
    $preview = $client->shares()->refreshPreview($shortId);
    return ['share' => $share, 'preview' => $preview];
}
