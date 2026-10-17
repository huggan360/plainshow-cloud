<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Iterable;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use RuntimeException;
/** @internal */
final class ArrayMissingSubType extends RuntimeException implements InvalidType
{
    public function __construct(string $arrayType)
    {
        parent::__construct("The subtype is missing for `{$arrayType}`.");
    }
}