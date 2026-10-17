<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class ParameterDeclarationNode extends Node
{
    public function __construct(
        /** @var non-empty-string */
        private string $name,
        private string $type
    )
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->write($this->type . ' $' . $this->name);
    }
}