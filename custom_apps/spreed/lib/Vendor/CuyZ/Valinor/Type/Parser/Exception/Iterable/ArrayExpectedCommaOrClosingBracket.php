<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Iterable;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use RuntimeException;
/** @internal */
final class ArrayExpectedCommaOrClosingBracket extends RuntimeException implements InvalidType
{
    public function __construct(string $arrayType, Type $subtype)
    {
        parent::__construct("Expected comma or closing bracket after `{$arrayType}<{$subtype->toString()}`.");
    }
}