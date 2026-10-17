<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Utility\String;

use function assert;
use function function_exists;
use function mb_strcut;
use function ord;
use function strlen;
use function substr;
/** @internal */
final class StringCutter
{
    public static function cut(string $s, int $length): string
    {
        if (function_exists('mb_strcut')) {
            return mb_strcut($s, 0, $length);
        }
        return self::cutPolyfill($s, $length);
    }
    public static function cutPolyfill(string $s, int $length): string
    {
        $s = substr($s, 0, $length);
        $cur = strlen($s) - 1;
        // U+0000 - U+007F
        if ((ord($s[$cur]) & 0b10000000) === 0) {
            return $s;
        }
        $cnt = 0;
        while ((ord($s[$cur]) & 0b11000000) === 0b10000000) {
            ++$cnt;
            if ($cur === 0) {
                // @infection-ignore-all // Causes infinite loop
                break;
            }
            --$cur;
        }
        assert($cur >= 0);
        return match (true) {
            default => substr($s, 0, $cur),
            // U+0080 - U+07FF
            $cnt === 1 && (ord($s[$cur]) & 0b11100000) === 0b11000000, $cnt === 2 && (ord($s[$cur]) & 0b11110000) === 0b11100000, $cnt === 3 && (ord($s[$cur]) & 0b11111000) === 0b11110000 => $s,
        };
    }
}