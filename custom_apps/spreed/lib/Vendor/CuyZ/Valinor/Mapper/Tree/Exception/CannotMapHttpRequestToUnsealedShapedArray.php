<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Exception\MappingLogicalException;
use LogicException;
/** @internal */
final class CannotMapHttpRequestToUnsealedShapedArray extends LogicException implements MappingLogicalException
{
    protected $message = 'Mapping an HTTP request to an unsealed shaped array is not supported.';
}