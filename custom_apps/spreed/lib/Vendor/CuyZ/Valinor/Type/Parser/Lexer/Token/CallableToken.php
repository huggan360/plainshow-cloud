<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\Token;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable\ExpectedClosingParenthesisAfterCallable;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable\ExpectedColonAfterCallableClosingParenthesis;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable\ExpectedReturnTypeAfterCallableColon;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable\ExpectedTypeForCallable;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\Callable\UnexpectedTokenAfterCallableClosingParenthesis;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Lexer\TokenStream;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\CallableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\IsSingleton;
/** @internal */
final class CallableToken implements TraversingToken
{
    use IsSingleton;
    public function traverse(TokenStream $stream): Type
    {
        if ($stream->done() || !$stream->next() instanceof OpeningParenthesisToken) {
            return CallableType::default();
        }
        $stream->forward();
        if ($stream->done()) {
            throw new ExpectedTypeForCallable();
        }
        $parameters = [];
        while (!$stream->next() instanceof ClosingParenthesisToken) {
            $parameters[] = $stream->read();
            if (!$stream->done() && $stream->next() instanceof CommaToken) {
                $stream->forward();
            }
            if ($stream->done()) {
                throw new ExpectedClosingParenthesisAfterCallable($parameters);
            }
        }
        $stream->forward();
        if ($stream->done()) {
            throw new ExpectedColonAfterCallableClosingParenthesis($parameters);
        }
        if (!($next = $stream->forward()) instanceof ColonToken) {
            throw new UnexpectedTokenAfterCallableClosingParenthesis($parameters, $next);
        }
        if ($stream->done()) {
            throw new ExpectedReturnTypeAfterCallableColon($parameters);
        }
        $returnType = $stream->read();
        return new CallableType($parameters, $returnType);
    }
    public function symbol(): string
    {
        return 'callable';
    }
}