<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\ClassDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\ObjectBuilder;
/** @internal */
final class InMemoryObjectBuilderFactory implements ObjectBuilderFactory
{
    /** @var array<string, non-empty-list<ObjectBuilder>> */
    private array $builders = [];
    public function __construct(private ObjectBuilderFactory $delegate)
    {
    }
    public function for(ClassDefinition $class): array
    {
        return $this->builders[$class->type->toString()] ??= $this->delegate->for($class);
    }
}