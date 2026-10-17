<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\Formatter;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\NodeMessage;
/** @api */
interface MessageFormatter
{
    /** @pure */
    public function format(NodeMessage $message): NodeMessage;
}