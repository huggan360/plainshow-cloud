<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Argument;
use LogicException;
/** @internal */
final class CircularDependencyDetected extends LogicException
{
    public function __construct(Argument $argument)
    {
        parent::__construct("Circular dependency detected for `{$argument->signature()}`.");
    }
}