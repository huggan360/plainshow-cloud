<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message;

/** @api */
interface Message
{
    /** @pure */
    public function body(): string;
}