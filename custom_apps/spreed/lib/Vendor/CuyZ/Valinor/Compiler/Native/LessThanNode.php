<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class LessThanNode extends Node
{
    public function __construct(private Node $left, private Node $right)
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->compile($this->left)->write(' < ')->compile($this->right);
    }
}