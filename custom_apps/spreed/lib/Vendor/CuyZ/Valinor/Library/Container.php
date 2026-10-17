<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Library;

use OCA\Talk\Vendor\CuyZ\Valinor\Cache\Cache;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\KeySanitizerCache;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\RuntimeCache;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\TypeFilesWatcher;
use OCA\Talk\Vendor\CuyZ\Valinor\Cache\Warmup\RecursiveCacheWarmupService;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionsContainer;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\CompiledClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\CompiledFunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler\ClassDefinitionCompiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler\FunctionDefinitionCompiler;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\InMemoryClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\InMemoryFunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\ClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\FunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\ReflectionAttributesRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\ReflectionClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\ReflectionFunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\ArgumentsMapper;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\CircularDependencyDetectorObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\ConstructorObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\DateTimeObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\DateTimeZoneObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\InMemoryObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\ObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\ReflectionObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\SortingObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Factory\StrictTypesObjectBuilderFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ArrayNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ConverterContainer;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\HttpRequestNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\InterfaceInferringContainer;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\InterfaceNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\KeyConversionPipeline;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\KeyConverterNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ListNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\MixedNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\NodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\NullNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ObjectNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ScalarNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ShapedArrayNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\TypeNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\UndefinedObjectNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\UnionNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder\ValueConverterNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\RootNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\TreeMapper;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\TypeArgumentsMapper;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\TypeTreeMapper;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\ArrayNormalizer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Format;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\JsonNormalizer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Normalizer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\CompiledTransformer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Compiler\TransformerDefinitionBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\RecursiveTransformer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\Transformer;
use OCA\Talk\Vendor\CuyZ\Valinor\Normalizer\Transformer\TransformerContainer;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Dumper\TypeDumper;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Factory\TypeParserFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\TypeParser;
use function call_user_func;
/** @internal */
final class Container
{
    /** @var array<class-string, object> */
    private array $services = [];
    /** @var array<class-string, callable(): object> */
    private array $factories;
    public function __construct(Settings $settings)
    {
        $this->factories = [TreeMapper::class => fn() => new TypeTreeMapper($this->get(TypeParser::class), $this->get(RootNodeBuilder::class)), ArgumentsMapper::class => fn() => new TypeArgumentsMapper($this->get(FunctionDefinitionRepository::class), $this->get(RootNodeBuilder::class)), RootNodeBuilder::class => fn() => new RootNodeBuilder($this->get(NodeBuilder::class), $this->get(TypeDumper::class), $settings), NodeBuilder::class => function () use ($settings) {
            $builder = new TypeNodeBuilder(new ArrayNodeBuilder(), new ListNodeBuilder(), new ShapedArrayNodeBuilder(), new ScalarNodeBuilder(), new UnionNodeBuilder(), new NullNodeBuilder(), new MixedNodeBuilder(), new UndefinedObjectNodeBuilder(), new ObjectNodeBuilder($this->get(ClassDefinitionRepository::class), $this->get(ObjectBuilderFactory::class), new InterfaceNodeBuilder($this->get(InterfaceInferringContainer::class), new FunctionsContainer($this->get(FunctionDefinitionRepository::class), $settings->customConstructors), $settings->exceptionFilter), $settings->exceptionFilter));
            if ($settings->keyConverters !== []) {
                $builder = new KeyConverterNodeBuilder($builder, $this->get(KeyConversionPipeline::class));
            }
            $builder = new HttpRequestNodeBuilder($builder, $this->get(KeyConversionPipeline::class));
            return new ValueConverterNodeBuilder($builder, $this->get(ConverterContainer::class), $this->get(ClassDefinitionRepository::class), $this->get(FunctionDefinitionRepository::class), $settings->exceptionFilter);
        }, ConverterContainer::class => fn() => new ConverterContainer($this->get(FunctionDefinitionRepository::class), $settings->convertersSortedByPriority()), KeyConversionPipeline::class => fn() => new KeyConversionPipeline($this->get(FunctionDefinitionRepository::class), $settings->keyConverters, $settings->exceptionFilter), InterfaceInferringContainer::class => fn() => new InterfaceInferringContainer(new FunctionsContainer($this->get(FunctionDefinitionRepository::class), $settings->inferredMapping), $this->get(TypeParser::class)), ObjectBuilderFactory::class => function () use ($settings) {
            $constructors = new FunctionsContainer($this->get(FunctionDefinitionRepository::class), $settings->customConstructors);
            $factory = new ReflectionObjectBuilderFactory();
            $factory = new ConstructorObjectBuilderFactory($factory, $settings->nativeConstructors, $constructors);
            $factory = new DateTimeZoneObjectBuilderFactory($factory, $this->get(FunctionDefinitionRepository::class));
            $factory = new DateTimeObjectBuilderFactory($factory, $settings->supportedDateFormats, $this->get(FunctionDefinitionRepository::class));
            $factory = new SortingObjectBuilderFactory($factory);
            $factory = new CircularDependencyDetectorObjectBuilderFactory($factory);
            if (!$settings->allowPermissiveTypes) {
                $factory = new StrictTypesObjectBuilderFactory($factory);
            }
            return new InMemoryObjectBuilderFactory($factory);
        }, Transformer::class => function () use ($settings) {
            if (isset($settings->cache)) {
                return new CompiledTransformer(
                    $this->get(TransformerDefinitionBuilder::class),
                    $this->get(TypeFilesWatcher::class),
                    new RuntimeCache($this->get(Cache::class)),
                    // @phpstan-ignore argument.type
                    $settings->transformersSortedByPriority()
                );
            }
            return new RecursiveTransformer($this->get(ClassDefinitionRepository::class), $this->get(FunctionDefinitionRepository::class), $this->get(TransformerContainer::class));
        }, TransformerContainer::class => fn() => new TransformerContainer($this->get(FunctionDefinitionRepository::class), $settings->transformersSortedByPriority()), ArrayNormalizer::class => fn() => new ArrayNormalizer($this->get(Transformer::class)), JsonNormalizer::class => fn() => new JsonNormalizer($this->get(Transformer::class)), TransformerDefinitionBuilder::class => fn() => new TransformerDefinitionBuilder($this->get(ClassDefinitionRepository::class), $this->get(FunctionDefinitionRepository::class), $this->get(TransformerContainer::class)), ClassDefinitionRepository::class => function () use ($settings) {
            $repository = new ReflectionClassDefinitionRepository($this->get(TypeParserFactory::class), $settings->allowedAttributes());
            if (isset($settings->cache)) {
                $repository = new CompiledClassDefinitionRepository($repository, $this->get(Cache::class), $this->get(TypeFilesWatcher::class), new ClassDefinitionCompiler());
            }
            return new InMemoryClassDefinitionRepository($repository);
        }, FunctionDefinitionRepository::class => function () use ($settings) {
            $repository = new ReflectionFunctionDefinitionRepository($this->get(TypeParserFactory::class), new ReflectionAttributesRepository($this->get(ClassDefinitionRepository::class), $settings->allowedAttributes()));
            if (isset($settings->cache)) {
                $repository = new CompiledFunctionDefinitionRepository($repository, $this->get(Cache::class), $this->get(TypeFilesWatcher::class), new FunctionDefinitionCompiler());
            }
            return new InMemoryFunctionDefinitionRepository($repository);
        }, TypeParserFactory::class => fn() => new TypeParserFactory(), TypeParser::class => fn() => $this->get(TypeParserFactory::class)->buildDefaultTypeParser(), TypeDumper::class => fn() => new TypeDumper($this->get(ClassDefinitionRepository::class), $this->get(ObjectBuilderFactory::class), $this->get(InterfaceInferringContainer::class), new FunctionsContainer($this->get(FunctionDefinitionRepository::class), $settings->customConstructors)), RecursiveCacheWarmupService::class => fn() => new RecursiveCacheWarmupService($this->get(TypeParser::class), $this->get(InterfaceInferringContainer::class), $this->get(ClassDefinitionRepository::class), $this->get(ObjectBuilderFactory::class)), Cache::class => fn() => new KeySanitizerCache($settings->cache, $settings), TypeFilesWatcher::class => function () use ($settings) {
            $classDefinitionRepository = new ReflectionClassDefinitionRepository($this->get(TypeParserFactory::class), $settings->allowedAttributes());
            $functionDefinitionRepository = new ReflectionFunctionDefinitionRepository($this->get(TypeParserFactory::class), new ReflectionAttributesRepository($classDefinitionRepository, $settings->allowedAttributes()));
            return new TypeFilesWatcher($settings, $classDefinitionRepository, $functionDefinitionRepository);
        }];
    }
    public function treeMapper(): TreeMapper
    {
        return $this->get(TreeMapper::class);
    }
    public function argumentsMapper(): ArgumentsMapper
    {
        return $this->get(ArgumentsMapper::class);
    }
    /**
     * @template T of Normalizer
     *
     * @param Format<T> $format
     * @return T
     */
    public function normalizer(Format $format): Normalizer
    {
        return $this->get($format->type());
    }
    public function cacheWarmupService(): RecursiveCacheWarmupService
    {
        return $this->get(RecursiveCacheWarmupService::class);
    }
    /**
     * @template T of object
     * @param class-string<T> $name
     * @return T
     */
    public function get(string $name): object
    {
        return $this->services[$name] ??= call_user_func($this->factories[$name]);
        // @phpstan-ignore-line
    }
}