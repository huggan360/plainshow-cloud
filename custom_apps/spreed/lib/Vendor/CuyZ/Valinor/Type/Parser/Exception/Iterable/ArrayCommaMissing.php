<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Iterable;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use RuntimeException;
/** @internal */
final class ArrayCommaMissing extends RuntimeException implements InvalidType
{
    public function __construct(string $symbol, Type $type)
    {
        $signature = "{$symbol}<{$type->toString()}, ?>";
        parent::__construct("A comma is missing for `{$signature}`.");
    }
}