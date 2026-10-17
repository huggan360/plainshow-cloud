<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\Token;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Intersection\RightIntersectionTypeMissing;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\TokenStream;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\IntersectionType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\IsSingleton;
/** @internal */
final class IntersectionToken implements LeftTraversingToken
{
    use IsSingleton;
    public function traverse(Type $type, TokenStream $stream): Type
    {
        if ($stream->done()) {
            throw new RightIntersectionTypeMissing($type);
        }
        $rightType = $stream->read();
        if ($rightType instanceof IntersectionType) {
            return IntersectionType::from($type, ...$rightType->types());
        }
        return IntersectionType::from($type, $rightType);
    }
    public function symbol(): string
    {
        return '&';
    }
}