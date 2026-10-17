<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasParameters;
/** @internal */
final class HttpRequestKeyCollision implements ErrorMessage, HasCode, HasParameters
{
    public function __construct(private string $key)
    {
    }
    public function body(): string
    {
        return 'Key `{key}` was found in several HTTP request sources. It must be sent in only one of route, query or body.';
    }
    public function code(): string
    {
        return 'key_collision';
    }
    public function parameters(): array
    {
        return ['key' => $this->key];
    }
}