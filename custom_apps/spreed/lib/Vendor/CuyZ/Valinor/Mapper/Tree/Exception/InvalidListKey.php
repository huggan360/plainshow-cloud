<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\ErrorMessage;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasCode;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\HasParameters;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\ValueDumper;
/** @internal */
final class InvalidListKey implements ErrorMessage, HasCode, HasParameters
{
    private string $body = 'Invalid sequential key {key}, expected {expected}.';
    private string $code = 'invalid_list_key';
    /** @var array<string, string> */
    private array $parameters;
    public function __construct(int|string $key, int $expected)
    {
        $this->parameters = ['key' => ValueDumper::dump($key), 'expected' => (string) $expected];
    }
    public function body(): string
    {
        return $this->body;
    }
    public function code(): string
    {
        return $this->code;
    }
    public function parameters(): array
    {
        return $this->parameters;
    }
}