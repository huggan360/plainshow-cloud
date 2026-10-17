<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TypeFormatter;

use BackedEnum;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\AnonymousClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TransformerDefinitionBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\EnumType;
use function is_a;
/** @internal */
final class EnumFormatter implements TypeFormatter
{
    public function __construct(private EnumType $type)
    {
    }
    public function formatValueNode(ComplianceNode $valueNode): Node
    {
        return is_a($this->type->className(), BackedEnum::class, true) ? $valueNode->access('value') : $valueNode->access('name');
    }
    public function manipulateTransformerClass(AnonymousClassNode $class, TransformerDefinitionBuilder $definitionBuilder): AnonymousClassNode
    {
        return $class;
    }
}