<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\Token;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Scalar\ClassStringClosingBracketMissing;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Scalar\ClassStringMissingSubType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\TokenStream;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ClassStringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnionType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\IsSingleton;
/** @internal */
final class ClassStringToken implements TraversingToken
{
    use IsSingleton;
    public function traverse(TokenStream $stream): Type
    {
        if ($stream->done() || !$stream->next() instanceof OpeningBracketToken) {
            return new ClassStringType();
        }
        $stream->forward();
        if ($stream->done()) {
            throw new ClassStringMissingSubType();
        }
        $type = $stream->read();
        if ($stream->done() || !$stream->forward() instanceof ClosingBracketToken) {
            throw new ClassStringClosingBracketMissing($type);
        }
        $types = $type instanceof UnionType ? $type->types() : [$type];
        return ClassStringType::from($types);
    }
    public function symbol(): string
    {
        return 'class-string';
    }
}