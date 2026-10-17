<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final readonly class MethodDefinition
{
    public function __construct(
        /** @var non-empty-string */
        public string $name,
        /** @var non-empty-string */
        public string $signature,
        public Attributes $attributes,
        public Parameters $parameters,
        public bool $isStatic,
        public bool $isPublic,
        public Type $returnType
    )
    {
    }
}