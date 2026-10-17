<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TypeFormatter;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\AnonymousClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TransformerDefinitionBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\InterfaceType;
use DateTimeInterface;
/** @internal */
final class InterfaceFormatter implements TypeFormatter
{
    public function __construct(private InterfaceType $type)
    {
    }
    public function formatValueNode(ComplianceNode $valueNode): Node
    {
        if ($this->type->className() === DateTimeInterface::class) {
            return (new DateTimeFormatter())->formatValueNode($valueNode);
        }
        return Node::this()->access('delegate')->callMethod('transform', [$valueNode]);
    }
    public function manipulateTransformerClass(AnonymousClassNode $class, TransformerDefinitionBuilder $definitionBuilder): AnonymousClassNode
    {
        return $class;
    }
}