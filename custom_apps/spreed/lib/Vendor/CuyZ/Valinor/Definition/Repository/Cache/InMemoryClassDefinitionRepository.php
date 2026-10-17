<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\ClassDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\ClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectType;
/** @internal */
final class InMemoryClassDefinitionRepository implements ClassDefinitionRepository
{
    /** @var array<string, ClassDefinition> */
    private array $classDefinitions = [];
    public function __construct(private ClassDefinitionRepository $delegate)
    {
    }
    public function for(ObjectType $type): ClassDefinition
    {
        return $this->classDefinitions[$type->toString()] ??= $this->delegate->for($type);
    }
}