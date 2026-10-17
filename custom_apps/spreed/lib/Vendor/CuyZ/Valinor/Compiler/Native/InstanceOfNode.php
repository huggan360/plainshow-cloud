<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class InstanceOfNode extends Node
{
    public function __construct(
        private Node $node,
        /** @var class-string */
        private string $className
    )
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        $className = $this->className;
        return $compiler->compile($this->node)->write(' instanceof ')->write($className);
    }
}