<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\Node;
use Exception;
/** @internal */
final class InvalidNodeDuringValueConversion extends Exception
{
    public function __construct(public readonly Node $node)
    {
        // @infection-ignore-all
        parent::__construct();
    }
}