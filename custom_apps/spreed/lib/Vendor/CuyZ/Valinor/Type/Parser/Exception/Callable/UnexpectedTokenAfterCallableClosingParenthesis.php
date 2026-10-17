<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\Token\Token;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use RuntimeException;
use function array_map;
use function implode;
/** @internal */
final class UnexpectedTokenAfterCallableClosingParenthesis extends RuntimeException implements InvalidType
{
    /**
     * @param list<Type> $parameters
     */
    public function __construct(array $parameters, Token $token)
    {
        $parameters = implode(', ', array_map(fn(Type $type) => $type->toString(), $parameters));
        parent::__construct("Expected `:` to define return type after `callable({$parameters})`, got `{$token->symbol()}`.");
    }
}