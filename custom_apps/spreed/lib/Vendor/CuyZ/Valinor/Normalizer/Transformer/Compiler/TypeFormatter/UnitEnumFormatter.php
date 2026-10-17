<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TypeFormatter;

use BackedEnum;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\AnonymousClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TransformerDefinitionBuilder;
/** @internal */
final class UnitEnumFormatter implements TypeFormatter
{
    public function formatValueNode(ComplianceNode $valueNode): Node
    {
        return Node::ternary(condition: $valueNode->instanceOf(BackedEnum::class), ifTrue: $valueNode->access('value'), ifFalse: $valueNode->access('name'));
    }
    public function manipulateTransformerClass(AnonymousClassNode $class, TransformerDefinitionBuilder $definitionBuilder): AnonymousClassNode
    {
        return $class;
    }
}