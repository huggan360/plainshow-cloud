<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
interface TypeParser
{
    public function parse(string $raw): Type;
}