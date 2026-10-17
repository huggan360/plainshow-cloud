<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition;

/** @internal */
final readonly class FunctionObject
{
    public function __construct(
        public FunctionDefinition $definition,
        /** @var callable */
        public mixed $callback
    )
    {
    }
}