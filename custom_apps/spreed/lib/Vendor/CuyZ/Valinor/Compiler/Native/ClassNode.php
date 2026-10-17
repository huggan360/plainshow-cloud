<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class ClassNode extends Node
{
    public function __construct(
        /** @var class-string */
        private string $name
    )
    {
    }
    /**
     * @param non-empty-string $method
     * @param array<Node> $arguments
     */
    public function callStaticMethod(string $method, array $arguments = []): Node
    {
        return new StaticMethodCallNode($this, $method, $arguments);
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->write($this->name);
    }
}