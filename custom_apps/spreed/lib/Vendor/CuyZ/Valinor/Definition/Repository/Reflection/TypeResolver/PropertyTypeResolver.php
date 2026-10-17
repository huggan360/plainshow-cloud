<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\Reflection\Annotations;
use ReflectionProperty;
/** @internal */
final class PropertyTypeResolver
{
    public function __construct(private ReflectionTypeResolver $typeResolver)
    {
    }
    public function resolveTypeFor(ReflectionProperty $reflection): Type
    {
        $docBlockType = Annotations::forProperty($reflection);
        return $this->typeResolver->resolveType($reflection->getType(), $docBlockType);
    }
    public function resolveNativeTypeFor(ReflectionProperty $reflection): Type
    {
        return $this->typeResolver->resolveNativeType($reflection->getType());
    }
}