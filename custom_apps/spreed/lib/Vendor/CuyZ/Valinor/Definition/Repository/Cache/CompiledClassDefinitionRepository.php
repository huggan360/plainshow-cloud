<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache;

use OCA\Talk\Vendor\CuyZ\Valinor\Cache\Cache;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\CacheEntry;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\TypeFilesWatcher;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\ClassDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler\ClassDefinitionCompiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\ClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectType;
/** @internal */
final class CompiledClassDefinitionRepository implements ClassDefinitionRepository
{
    public function __construct(
        private ClassDefinitionRepository $delegate,
        /** @var Cache<ClassDefinition> */
        private Cache $cache,
        private TypeFilesWatcher $filesWatcher,
        private ClassDefinitionCompiler $compiler
    )
    {
    }
    public function for(ObjectType $type): ClassDefinition
    {
        // @infection-ignore-all
        $key = "class-definition-\x00" . $type->toString();
        $entry = $this->cache->get($key);
        if ($entry) {
            return $entry;
        }
        $class = $this->delegate->for($type);
        $code = 'fn () => ' . $this->compiler->compile($class);
        $filesToWatch = fn() => $this->filesWatcher->for($type);
        $this->cache->set($key, new CacheEntry($code, $filesToWatch));
        /** @var ClassDefinition */
        return $this->cache->get($key);
    }
}