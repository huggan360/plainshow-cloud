<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class TernaryNode extends Node
{
    public function __construct(private Node $condition, private Node $ifTrue, private Node $ifFalse)
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->compile($this->condition)->write(' ? ')->compile($this->ifTrue)->write(' : ')->compile($this->ifFalse);
    }
}