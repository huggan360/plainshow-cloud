<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use RuntimeException;
/** @internal */
final class ExpectedTypeForCallable extends RuntimeException implements InvalidType
{
    public function __construct()
    {
        parent::__construct('Expected type after `callable(`.');
    }
}