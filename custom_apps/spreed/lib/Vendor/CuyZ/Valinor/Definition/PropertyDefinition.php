<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final readonly class PropertyDefinition
{
    public function __construct(
        /** @var non-empty-string */
        public string $name,
        /** @var non-empty-string */
        public string $signature,
        public Type $type,
        public Type $nativeType,
        public bool $hasDefaultValue,
        public mixed $defaultValue,
        public bool $isPublic,
        public Attributes $attributes
    )
    {
    }
}