<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
/** @internal */
final class SourceIsNotNull implements ErrorMessage, HasCode
{
    private string $body = 'Value {source_value} is not null.';
    private string $code = 'value_is_not_null';
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
}