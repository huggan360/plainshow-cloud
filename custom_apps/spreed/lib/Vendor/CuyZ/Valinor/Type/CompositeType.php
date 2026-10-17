<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type;

/** @internal */
interface CompositeType extends Type
{
    /**
     * @return list<Type>
     */
    public function traverse(): array;
    /**
     * @param callable<T of Type>(T): T $callback
     */
    public function replace(callable $callback): Type;
}