<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
/** @internal */
final class SourceIsEmptyList implements ErrorMessage, HasCode
{
    private string $body = 'Cannot be empty and must be filled with a value matching {expected_signature}.';
    private string $code = 'value_is_empty_list';
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
}