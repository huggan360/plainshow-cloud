<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class AssignNode extends Node
{
    public function __construct(private Node $node, private Node $value)
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->compile($this->node)->write(' = ')->compile($this->value);
    }
}