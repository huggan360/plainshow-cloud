<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ScalarType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final class InvalidNodeValue implements ErrorMessage, HasCode
{
    private string $body = 'Value {source_value} does not match {expected_signature}.';
    private string $code = 'invalid_value';
    public static function from(Type $type): ErrorMessage
    {
        if ($type instanceof ScalarType) {
            return $type->errorMessage();
        }
        return new self();
    }
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
}