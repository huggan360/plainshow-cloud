<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\FunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\Reflection\Reflection;
/** @internal */
final class InMemoryFunctionDefinitionRepository implements FunctionDefinitionRepository
{
    /** @var array<string, FunctionDefinition> */
    private array $functionDefinitions = [];
    public function __construct(private FunctionDefinitionRepository $delegate)
    {
    }
    public function for(callable $function): FunctionDefinition
    {
        $reflection = Reflection::function($function);
        // @infection-ignore-all
        $key = $reflection->getFileName() . ':' . $reflection->getStartLine() . '-' . $reflection->getEndLine();
        return ($this->functionDefinitions[$key] ??= $this->delegate->for($function))->forCallable($function);
    }
}