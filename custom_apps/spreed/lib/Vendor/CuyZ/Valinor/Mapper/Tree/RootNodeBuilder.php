<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Attributes;
use OCA\Talk\Vendor\CuyZ\Valinor\Library\Settings;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\Node;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\NodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Dumper\TypeDumper;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
/** @internal */
final class RootNodeBuilder
{
    public function __construct(private NodeBuilder $nodeBuilder, private TypeDumper $typeDumper, private Settings $settings)
    {
    }
    public function build(mixed $value, Type $type, ?Attributes $attributes = null): Node
    {
        $shell = new Shell(
            name: '',
            path: '*root*',
            type: $type,
            hasValue: true,
            value: $value,
            attributes: $attributes ?? Attributes::empty(),
            allowScalarValueCasting: $this->settings->allowScalarValueCasting,
            allowNonSequentialList: $this->settings->allowNonSequentialList,
            allowUndefinedValues: $this->settings->allowUndefinedValues,
            allowSuperfluousKeys: $this->settings->allowSuperfluousKeys,
            allowPermissiveTypes: $this->settings->allowPermissiveTypes,
            allowedSuperfluousKeys: [],
            shouldApplyConverters: true,
            nodeBuilder: $this->nodeBuilder,
            typeDumper: $this->typeDumper,
            // @infection-ignore-all
            childrenCount: 0
        );
        return $shell->build();
    }
}