<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\MethodDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use LogicException;
/** @internal */
final class KeyConverterHasInvalidStringParameter extends LogicException
{
    public function __construct(MethodDefinition|FunctionDefinition $method, Type $parameterType)
    {
        parent::__construct("Key converter's parameter must be a string, `{$parameterType->toString()}` given for `{$method->signature}`.");
    }
}