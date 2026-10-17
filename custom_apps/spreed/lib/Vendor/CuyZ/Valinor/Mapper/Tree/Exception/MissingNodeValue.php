<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\Message;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ScalarType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final class MissingNodeValue implements ErrorMessage, HasCode
{
    private string $body = 'Cannot be empty and must be filled with a value matching {expected_signature}.';
    private string $code = 'missing_value';
    public static function from(Type $type): Message
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