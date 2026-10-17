<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasParameters;
/** @internal */
final class KeysCollision implements ErrorMessage, HasCode, HasParameters
{
    public function __construct(private string $key, private string $duplicateKey)
    {
    }
    public function body(): string
    {
        return 'Collision between keys `{key}` and `{duplicate_key}`.';
    }
    public function code(): string
    {
        return 'keys_collision';
    }
    public function parameters(): array
    {
        return ['key' => $this->key, 'duplicate_key' => $this->duplicateKey];
    }
}