<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Types;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\IsSingleton;
use function is_object;
/** @internal */
final class UndefinedObjectType implements Type
{
    use IsSingleton;
    public function accepts(mixed $value): bool
    {
        return is_object($value);
    }
    public function compiledAccept(ComplianceNode $node): ComplianceNode
    {
        return Node::functionCall('is_object', [$node]);
    }
    public function matches(Type $other): bool
    {
        if ($other instanceof UnionType) {
            return $other->isMatchedBy($this);
        }
        return $other instanceof self || $other instanceof MixedType;
    }
    public function inferGenericsFrom(Type $other, Generics $generics): Generics
    {
        return $generics;
    }
    public function nativeType(): UndefinedObjectType
    {
        return $this;
    }
    public function toString(): string
    {
        return 'object';
    }
}