<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Reflection\TypeResolver;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\ObjectWithGenericType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Factory\TypeParserFactory;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\Reflection\Reflection;
use function array_shift;
/** @internal */
final class ClassGenericResolver
{
    private TemplateResolver $templateResolver;
    public function __construct(private TypeParserFactory $typeParserFactory)
    {
        $this->templateResolver = new TemplateResolver();
    }
    /**
     * @return array<non-empty-string, Type>
     */
    public function resolveGenerics(ObjectWithGenericType $type): array
    {
        $typeParser = $this->typeParserFactory->buildAdvancedTypeParserForClass($type->className());
        $templates = $this->templateResolver->templatesFromDocBlock(Reflection::class($type->className()), $type->className(), $typeParser);
        $generics = $type->generics();
        $assignedGenerics = [];
        foreach ($templates as $template => $templateType) {
            $generic = $generics === [] ? $templateType : array_shift($generics);
            if ($templateType->innerType instanceof UnresolvableType) {
                $generic = $templateType->innerType;
            } elseif (!$generic instanceof UnresolvableType && !$generic->matches($templateType->innerType)) {
                $generic = UnresolvableType::forInvalidAssignedGeneric($generic, $templateType->innerType, $template, $type->className());
            }
            $assignedGenerics[$template] = $generic;
        }
        return $assignedGenerics;
    }
}