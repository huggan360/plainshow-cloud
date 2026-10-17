<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
/** @internal */
final class UnexpectedKeyInSource implements ErrorMessage, HasCode
{
    private string $body = 'Unexpected key `{node_name}`.';
    private string $code = 'unexpected_key';
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
}