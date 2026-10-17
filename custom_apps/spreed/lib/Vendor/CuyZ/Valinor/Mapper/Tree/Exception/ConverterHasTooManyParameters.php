<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\MethodDefinition;
use LogicException;
/** @internal */
final class ConverterHasTooManyParameters extends LogicException
{
    public function __construct(MethodDefinition|FunctionDefinition $method)
    {
        parent::__construct("Converter must have at most 2 parameters, {$method->parameters->count()} given for `{$method->signature}`.");
    }
}