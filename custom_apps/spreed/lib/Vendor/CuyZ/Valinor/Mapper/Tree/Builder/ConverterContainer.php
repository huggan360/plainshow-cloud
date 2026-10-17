<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Builder;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\AttributeDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\FunctionDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\MethodDefinition;
use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\FunctionDefinitionRepository;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception\ConverterHasInvalidCallableParameter;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception\ConverterHasNoParameter;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Exception\ConverterHasTooManyParameters;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\CallableType;
/** @internal */
final class ConverterContainer
{
    private bool $convertersCallablesWereChecked = false;
    public function __construct(
        private FunctionDefinitionRepository $functionDefinitionRepository,
        /** @var list<callable> */
        private array $converters
    )
    {
    }
    /**
     * @return list<callable>
     */
    public function converters(): array
    {
        if (!$this->convertersCallablesWereChecked) {
            $this->convertersCallablesWereChecked = true;
            foreach ($this->converters as $transformer) {
                $function = $this->functionDefinitionRepository->for($transformer);
                self::checkConverter($function);
            }
        }
        return $this->converters;
    }
    public static function filterConverterAttributes(AttributeDefinition $attribute): bool
    {
        return $attribute->class->methods->has('map') && self::checkConverter($attribute->class->methods->get('map'));
    }
    private static function checkConverter(MethodDefinition|FunctionDefinition $method): bool
    {
        $parameters = $method->parameters;
        if ($parameters->count() === 0) {
            throw new ConverterHasNoParameter($method);
        }
        if ($parameters->count() > 2) {
            throw new ConverterHasTooManyParameters($method);
        }
        if ($parameters->count() > 1 && !$parameters->at(1)->nativeType instanceof CallableType) {
            throw new ConverterHasInvalidCallableParameter($method, $parameters->at(1)->nativeType);
        }
        return true;
    }
}