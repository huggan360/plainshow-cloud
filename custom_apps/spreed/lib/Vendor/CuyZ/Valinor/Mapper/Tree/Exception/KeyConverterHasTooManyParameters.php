<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\MethodDefinition;
use LogicException;
/** @internal */
final class KeyConverterHasTooManyParameters extends LogicException
{
    public function __construct(MethodDefinition|FunctionDefinition $method)
    {
        parent::__construct("Key converter must have only one parameter, {$method->parameters->count()} given for `{$method->signature}`.");
    }
}