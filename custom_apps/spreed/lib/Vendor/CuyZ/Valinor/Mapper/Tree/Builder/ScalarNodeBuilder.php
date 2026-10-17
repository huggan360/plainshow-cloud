<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Shell;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ScalarType;
use function assert;
/** @internal */
final class ScalarNodeBuilder implements NodeBuilder
{
    public function build(Shell $shell): Node
    {
        $type = $shell->type;
        $value = $shell->value();
        assert($type instanceof ScalarType);
        if ($type->accepts($value)) {
            return $shell->node($value);
        }
        if (!$shell->allowScalarValueCasting || !$type->canCast($value)) {
            return $shell->error($type->errorMessage());
        }
        return $shell->node($type->cast($value));
    }
}