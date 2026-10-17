<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception\CannotMapToPermissiveType;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Shell;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\MixedType;
use function assert;
/** @internal */
final class MixedNodeBuilder implements NodeBuilder
{
    public function build(Shell $shell): Node
    {
        assert($shell->type instanceof MixedType);
        if (!$shell->allowPermissiveTypes) {
            throw new CannotMapToPermissiveType($shell);
        }
        return $shell->node($shell->value());
    }
}