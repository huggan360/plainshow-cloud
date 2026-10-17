<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Magic;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use RuntimeException;
/** @internal */
final class ValueOfMissingSubType extends RuntimeException implements InvalidType
{
    public function __construct()
    {
        parent::__construct('The subtype is missing for `value-of<`.');
    }
}