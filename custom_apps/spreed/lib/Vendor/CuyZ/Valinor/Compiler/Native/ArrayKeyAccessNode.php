<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class ArrayKeyAccessNode extends Node
{
    public function __construct(private Node $node, private Node $key)
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        $key = $compiler->sub()->compile($this->key)->code();
        return $compiler->compile($this->node)->write('[' . $key . ']');
    }
}