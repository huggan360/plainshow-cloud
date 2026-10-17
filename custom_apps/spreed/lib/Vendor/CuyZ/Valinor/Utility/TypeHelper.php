<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Utility;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\BooleanType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\CompositeTraversableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\CompositeType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\FloatType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\IntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ScalarType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\StringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NullType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\VacantType;
/** @internal */
final class TypeHelper
{
    /**
     * Sorting the types by priority: objects, arrays, scalars/null, everything else.
     */
    public static function typePriority(Type $type): int
    {
        return match (true) {
            $type instanceof ObjectType => 3,
            $type instanceof CompositeTraversableType => 2,
            $type instanceof ScalarType, $type instanceof NullType => 1,
            default => 0,
        };
    }
    /**
     * Sorting the scalar types by priority: int, float, string, bool.
     */
    public static function scalarTypePriority(ScalarType $type): int
    {
        return match (true) {
            $type instanceof IntegerType => 4,
            $type instanceof FloatType => 3,
            $type instanceof StringType => 2,
            $type instanceof BooleanType => 1,
            default => 0,
        };
    }
    /**
     * @return list<Type>
     */
    public static function traverseRecursively(Type $type): array
    {
        $types = [];
        if ($type instanceof CompositeType) {
            foreach ($type->traverse() as $subType) {
                $types = [...$types, $subType, ...self::traverseRecursively($subType)];
            }
        }
        return $types;
    }
    /**
     * @param non-empty-array<non-empty-string, Type> $vacantTypes
     */
    public static function assignVacantTypes(Type $type, array $vacantTypes): Type
    {
        try {
            return self::doAssignVacantTypes($type, $vacantTypes);
        } catch (InvalidType $exception) {
            return new UnresolvableType($type->toString(), $exception->getMessage());
        }
    }
    /**
     * @param non-empty-array<non-empty-string, Type> $vacantTypes
     */
    private static function doAssignVacantTypes(Type $type, array $vacantTypes): Type
    {
        if ($type instanceof VacantType && isset($vacantTypes[$type->symbol()])) {
            return $vacantTypes[$type->symbol()];
        }
        if ($type instanceof CompositeType) {
            return $type->replace(static fn(Type $subType) => self::doAssignVacantTypes($subType, $vacantTypes));
        }
        return $type;
    }
}