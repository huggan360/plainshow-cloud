<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer;

/** @internal */
interface Transformer
{
    public function transform(mixed $value): mixed;
}