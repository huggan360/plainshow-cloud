<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Attributes;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\ClassDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\MethodDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Methods;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Properties;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\PropertyDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\AttributesRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\ClassDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver\ClassGenericResolver;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver\ClassImportedTypeAliasResolver;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver\ClassLocalTypeAliasResolver;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver\ClassParentTypeResolver;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver\ReflectionTypeResolver;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Object\Constructor;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Factory\TypeParserFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\UnresolvableTypeFinderParser;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\VacantTypeAssignerParser;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\InterfaceType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeClassType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\Reflection\Reflection;
use ReflectionMethod;
use ReflectionProperty;
use function array_count_values;
use function array_filter;
use function array_keys;
use function array_map;
/** @internal */
final class ReflectionClassDefinitionRepository implements ClassDefinitionRepository
{
    private TypeParserFactory $typeParserFactory;
    private AttributesRepository $attributesRepository;
    private ReflectionPropertyDefinitionBuilder $propertyBuilder;
    private ReflectionMethodDefinitionBuilder $methodBuilder;
    private ClassParentTypeResolver $parentTypeResolver;
    private ClassGenericResolver $genericResolver;
    private ClassLocalTypeAliasResolver $localTypeAliasResolver;
    private ClassImportedTypeAliasResolver $importedTypeAliasResolver;
    /**
     * @param list<class-string> $allowedAttributes
     */
    public function __construct(TypeParserFactory $typeParserFactory, array $allowedAttributes)
    {
        $this->typeParserFactory = $typeParserFactory;
        $this->attributesRepository = new ReflectionAttributesRepository($this, $allowedAttributes);
        $this->propertyBuilder = new ReflectionPropertyDefinitionBuilder($this->attributesRepository);
        $this->methodBuilder = new ReflectionMethodDefinitionBuilder($this->attributesRepository);
        $this->parentTypeResolver = new ClassParentTypeResolver($this->typeParserFactory);
        $this->genericResolver = new ClassGenericResolver($this->typeParserFactory);
        $this->localTypeAliasResolver = new ClassLocalTypeAliasResolver($this->typeParserFactory);
        $this->importedTypeAliasResolver = new ClassImportedTypeAliasResolver($this->typeParserFactory);
    }
    public function for(ObjectType $type): ClassDefinition
    {
        $reflection = Reflection::class($type->className());
        $vacantTypes = $this->vacantTypes($type);
        $nativeTypeParser = $this->typeParserFactory->buildNativeTypeParserForClass($type->className());
        $advancedTypeParser = $this->typeParserFactory->buildAdvancedTypeParserForClass($type->className());
        $advancedTypeParser = new VacantTypeAssignerParser($advancedTypeParser, $vacantTypes);
        $advancedTypeParser = new UnresolvableTypeFinderParser($advancedTypeParser);
        $typeResolver = new ReflectionTypeResolver($nativeTypeParser, $advancedTypeParser);
        return new ClassDefinition($reflection->name, $type, new Attributes(...$this->attributesRepository->for($reflection)), new Properties(...$this->properties($type, $typeResolver)), new Methods(...$this->methods($type, $typeResolver)), $reflection->isFinal(), $reflection->isAbstract());
    }
    /**
     * @return array<non-empty-string, Type>
     */
    private function vacantTypes(ObjectType $type): array
    {
        $generics = [];
        if ($type instanceof NativeClassType || $type instanceof InterfaceType) {
            $generics = $this->genericResolver->resolveGenerics($type);
        }
        $localTypes = $this->localTypeAliasResolver->resolveLocalTypeAliases($type);
        $importedTypes = $this->importedTypeAliasResolver->resolveImportedTypeAliases($type);
        $vacantTypes = [...$generics, ...$localTypes, ...$importedTypes];
        $keys = [...array_keys($generics), ...array_keys($localTypes), ...array_keys($importedTypes)];
        // PHP8.5 use pipes
        $aliasCollision = array_filter(array_count_values($keys), fn(int $count) => $count > 1);
        foreach ($aliasCollision as $alias => $numberOfCollisions) {
            /** @var non-empty-string $alias */
            $vacantTypes[$alias] = UnresolvableType::forClassTypeAliasesCollision($alias, $numberOfCollisions);
        }
        return $vacantTypes;
    }
    /**
     * @return list<PropertyDefinition>
     */
    private function properties(ObjectType $type, ReflectionTypeResolver $typeResolver): array
    {
        $reflection = Reflection::class($type->className());
        $properties = [];
        foreach ($reflection->getProperties() as $property) {
            $declaringClass = $property->getDeclaringClass();
            if ($declaringClass->name === $type->className()) {
                $properties[$property->name] = $this->propertyBuilder->for($property, $typeResolver);
            } else {
                $parentClass = $this->parentTypeResolver->resolveParentTypeFor($type);
                $properties[$property->name] = $this->for($parentClass)->properties->get($property->name);
            }
        }
        // Properties will be sorted by inheritance order, from parent to child.
        $sortedProperties = [];
        while ($reflection) {
            $currentProperties = array_map(fn(ReflectionProperty $property) => $properties[$property->name], array_filter($reflection->getProperties(), fn(ReflectionProperty $property) => isset($properties[$property->name])));
            $sortedProperties = [...$currentProperties, ...$sortedProperties];
            $reflection = $reflection->getParentClass();
        }
        return $sortedProperties;
    }
    /**
     * @return array<MethodDefinition>
     */
    private function methods(ObjectType $type, ReflectionTypeResolver $typeResolver): array
    {
        $reflection = Reflection::class($type->className());
        $methods = array_filter($reflection->getMethods(), $this->shouldMethodBeIncluded(...));
        // Because `ReflectionMethod::getMethods()` wont list the constructor if
        // it comes from a parent class AND is not public, we need to manually
        // fetch it and add it to the list.
        if ($reflection->hasMethod('__construct')) {
            $methods[] = $reflection->getMethod('__construct');
        }
        return array_map(function (ReflectionMethod $method) use ($type, $typeResolver) {
            $declaringClass = $method->getDeclaringClass();
            if ($declaringClass->name === $type->className()) {
                return $this->methodBuilder->for($method, $typeResolver);
            }
            $parentClass = $this->parentTypeResolver->resolveParentTypeFor($type);
            return $this->for($parentClass)->methods->get($method->name);
        }, $methods);
    }
    private function shouldMethodBeIncluded(ReflectionMethod $method): bool
    {
        return $method->name === 'map' || $method->name === 'normalize' || $method->name === 'normalizeKey' || $method->getAttributes(Constructor::class) !== [];
    }
}