<?php

declare(strict_types=1);

return [
    'openapi-file' => __DIR__ . '/../contracts/php.json',
    'namespace' => 'MusicCloud\\Generated',
    'directory' => __DIR__ . '/generated',
    'strict' => true,
    'use-fixer' => false,
    'clean-generated' => true,
    'reference' => true,
];
