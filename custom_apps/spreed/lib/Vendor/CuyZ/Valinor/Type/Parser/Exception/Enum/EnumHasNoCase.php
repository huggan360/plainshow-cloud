<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Enum;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use RuntimeException;
/** @internal */
final class EnumHasNoCase extends RuntimeException implements InvalidType
{
    /**
     * @param class-string $enumName
     */
    public function __construct(string $enumName)
    {
        parent::__construct("Enum `{$enumName}` must have at least one case.");
    }
}