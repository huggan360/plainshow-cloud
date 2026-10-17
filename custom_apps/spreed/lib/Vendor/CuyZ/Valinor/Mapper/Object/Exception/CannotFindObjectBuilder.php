<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
/** @internal */
final class CannotFindObjectBuilder implements ErrorMessage, HasCode
{
    private string $body = 'Value {source_value} does not match {expected_signature}.';
    private string $code = 'cannot_find_object_builder';
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
}