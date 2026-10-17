<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectType;
/** @internal */
final readonly class ClassDefinition
{
    public function __construct(
        /** @var class-string */
        public string $name,
        public ObjectType $type,
        public Attributes $attributes,
        public Properties $properties,
        public Methods $methods,
        public bool $isFinal,
        public bool $isAbstract
    )
    {
    }
}