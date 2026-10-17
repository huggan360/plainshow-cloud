<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Library;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Compiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final class TypeAcceptNode extends Node
{
    public function __construct(private ComplianceNode $node, private Type $type)
    {
    }
    public function compile(Compiler $compiler): Compiler
    {
        return $compiler->compile($this->type->compiledAccept($this->node));
    }
}