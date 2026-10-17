<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
/** @internal */
final class ClassNameNode extends Node
{
    public function __construct(
        /** @var class-string */
        private string $className
    )
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->write($this->className . '::class');
    }
}