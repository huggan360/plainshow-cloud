<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Exception\MappingLogicalException;
use LogicException;
/** @internal */
final class CannotUseBothFromQueryAttributes extends LogicException implements MappingLogicalException
{
    protected $message = 'Cannot use `#[FromQuery(asRoot: true)]` alongside other `#[FromQuery]` attributes.';
}