<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TypeFormatter;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\AnonymousClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TransformerDefinitionBuilder;
/** @internal */
interface TypeFormatter
{
    public function formatValueNode(ComplianceNode $valueNode): Node;
    public function manipulateTransformerClass(AnonymousClassNode $class, TransformerDefinitionBuilder $definitionBuilder): AnonymousClassNode;
}