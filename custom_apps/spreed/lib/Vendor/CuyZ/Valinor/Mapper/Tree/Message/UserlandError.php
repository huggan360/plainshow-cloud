<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message;

use RuntimeException;
use Throwable;
/** @internal */
final class UserlandError extends RuntimeException
{
    public static function from(Throwable $message): Throwable
    {
        if ($message instanceof ErrorMessage) {
            return $message;
        }
        return new self(previous: $message);
    }
}