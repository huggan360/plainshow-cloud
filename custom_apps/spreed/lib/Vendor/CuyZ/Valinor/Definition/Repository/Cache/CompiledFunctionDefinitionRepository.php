<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache;

use OCA\Talk\Vendor\CuyZ\Valinor\Cache\Cache;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\CacheEntry;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\TypeFilesWatcher;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler\FunctionDefinitionCompiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\FunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\Reflection\Reflection;
/** @internal */
final class CompiledFunctionDefinitionRepository implements FunctionDefinitionRepository
{
    public function __construct(
        private FunctionDefinitionRepository $delegate,
        /** @var Cache<FunctionDefinition> */
        private Cache $cache,
        private TypeFilesWatcher $filesWatcher,
        private FunctionDefinitionCompiler $compiler
    )
    {
    }
    public function for(callable $function): FunctionDefinition
    {
        $reflection = Reflection::function($function);
        // @infection-ignore-all
        $key = "function-definition-\x00" . $reflection->getFileName() . ':' . $reflection->getStartLine() . '-' . $reflection->getEndLine();
        $entry = $this->cache->get($key);
        if ($entry) {
            return $entry->forCallable($function);
        }
        $definition = $this->delegate->for($function);
        $code = 'fn () => ' . $this->compiler->compile($definition);
        $filesToWatch = fn() => $this->filesWatcher->for($function);
        $this->cache->set($key, new CacheEntry($code, $filesToWatch));
        /** @var FunctionDefinition */
        return $this->cache->get($key)?->forCallable($function);
    }
}