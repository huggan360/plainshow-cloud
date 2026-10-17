<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use RuntimeException;
use function assert;
/** @internal */
final class ConverterHasInvalidReturnType extends RuntimeException
{
    public function __construct(FunctionDefinition $function)
    {
        assert($function->returnType instanceof UnresolvableType);
        parent::__construct($function->returnType->message());
    }
}