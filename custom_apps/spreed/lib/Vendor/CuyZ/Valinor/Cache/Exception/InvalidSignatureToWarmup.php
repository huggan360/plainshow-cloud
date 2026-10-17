<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Cache\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use RuntimeException;
use function lcfirst;
/** @internal */
final class InvalidSignatureToWarmup extends RuntimeException
{
    public function __construct(UnresolvableType $unresolvableType)
    {
        parent::__construct("Cannot warm up invalid signature `{$unresolvableType->toString()}`: " . lcfirst($unresolvableType->message()));
    }
}