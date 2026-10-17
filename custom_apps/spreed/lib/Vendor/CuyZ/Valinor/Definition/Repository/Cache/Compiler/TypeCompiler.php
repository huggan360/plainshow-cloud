<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler;

use OCA\Talk\Vendor\CuyZ\Valinor\Definition\Repository\Cache\Compiler\Exception\TypeCannotBeCompiled;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ArrayKeyType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ArrayType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\BooleanValueType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\CallableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ClassStringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\EnumType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\FloatValueType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\GenericType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\IntegerRangeType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\IntegerValueType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\InterfaceType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\IntersectionType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\IterableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ListType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\MixedType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeBooleanType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeClassType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeFloatType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeIntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NativeStringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NegativeIntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NonEmptyArrayType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NonEmptyListType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NonEmptyStringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NonNegativeIntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NonPositiveIntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NullType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\NumericStringType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\PositiveIntegerType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ScalarConcreteType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ShapedArrayElement;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\ShapedArrayType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\StringValueType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UndefinedObjectType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnionType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use UnitEnum;
use function array_keys;
use function array_map;
use function implode;
use function str_ends_with;
use function var_export;
/** @internal */
final class TypeCompiler
{
    public function __construct(private AttributesCompiler $attributesCompiler)
    {
    }
    public function compile(Type $type): string
    {
        $class = $type::class;
        switch (true) {
            case $type instanceof NullType:
            case $type instanceof NativeBooleanType:
            case $type instanceof NativeFloatType:
            case $type instanceof NativeIntegerType:
            case $type instanceof PositiveIntegerType:
            case $type instanceof NegativeIntegerType:
            case $type instanceof NonPositiveIntegerType:
            case $type instanceof NonNegativeIntegerType:
            case $type instanceof NativeStringType:
            case $type instanceof NonEmptyStringType:
            case $type instanceof NumericStringType:
            case $type instanceof UndefinedObjectType:
            case $type instanceof MixedType:
            case $type instanceof ScalarConcreteType:
                return "{$class}::get()";
            case $type instanceof BooleanValueType:
                return $type->value() === true ? "{$class}::true()" : "{$class}::false()";
            case $type instanceof IntegerRangeType:
                return "new {$class}({$type->min()}, {$type->max()})";
            case $type instanceof StringValueType:
                $value = var_export($type->toString(), true);
                return "{$class}::from({$value})";
            case $type instanceof IntegerValueType:
            case $type instanceof FloatValueType:
                $value = var_export($type->value(), true);
                return "new {$class}({$value})";
            case $type instanceof IntersectionType:
            case $type instanceof UnionType:
                $subTypes = array_map($this->compile(...), $type->types());
                return "new {$class}(" . implode(', ', $subTypes) . ')';
            case $type instanceof ArrayKeyType:
                return match ($type->toString()) {
                    'array-key' => "{$class}::default()",
                    'string' => "{$class}::string()",
                    'int' => "{$class}::integer()",
                    default => (function () use ($type, $class) {
                        $types = array_map($this->compile(...), $type->types);
                        return "new {$class}([" . implode(', ', $types) . '])';
                    })(),
                };
            case $type instanceof ShapedArrayType:
                $elements = [];
                foreach ($type->elements as $key => $element) {
                    $subkey = $this->compile($element->key());
                    $subtype = $this->compile($element->type());
                    $optional = var_export($element->isOptional(), true);
                    $attributes = $this->attributesCompiler->compile($element->attributes());
                    $elements[] = var_export($key, true) . ' => new ' . ShapedArrayElement::class . "({$subkey}, {$subtype}, {$optional}, {$attributes})";
                }
                $elements = implode(', ', $elements);
                $isUnsealed = var_export($type->isUnsealed, true);
                $unsealedType = $type->hasUnsealedType() ? $this->compile($type->unsealedType()) : 'null';
                return "new {$class}([{$elements}], {$isUnsealed}, {$unsealedType})";
            case $type instanceof ArrayType:
            case $type instanceof NonEmptyArrayType:
                if ($type->toString() === 'array' || $type->toString() === 'non-empty-array') {
                    return "{$class}::native()";
                }
                $subType = $this->compile($type->subType());
                if (str_ends_with($type->toString(), '[]')) {
                    return "{$class}::simple({$subType})";
                }
                $keyType = $this->compile($type->keyType());
                return "new {$class}({$keyType}, {$subType})";
            case $type instanceof ListType:
            case $type instanceof NonEmptyListType:
                if ($type->toString() === 'list' || $type->toString() === 'non-empty-list') {
                    return "{$class}::native()";
                }
                $subType = $this->compile($type->subType());
                return "new {$class}({$subType})";
            case $type instanceof IterableType:
                $keyType = $this->compile($type->keyType());
                $subType = $this->compile($type->subType());
                return "new {$class}({$keyType}, {$subType})";
            case $type instanceof NativeClassType:
            case $type instanceof InterfaceType:
                $generics = [];
                foreach ($type->generics() as $key => $generic) {
                    $generics[] = var_export($key, true) . ' => ' . $this->compile($generic);
                }
                $generics = implode(', ', $generics);
                return "new {$class}('{$type->className()}', [{$generics}])";
            case $type instanceof ClassStringType:
                $subTypes = implode(', ', array_map($this->compile(...), $type->subTypes()));
                return "new {$class}([{$subTypes}])";
            case $type instanceof EnumType:
                $enumName = var_export($type->className(), true);
                $pattern = var_export($type->pattern(), true);
                $cases = array_map(fn(string|int $key, UnitEnum $case) => var_export($key, true) . ' => ' . var_export($case, true), array_keys($type->cases()), $type->cases());
                $cases = implode(', ', $cases);
                return "new {$class}({$enumName}, {$pattern}, [{$cases}])";
            case $type instanceof CallableType:
                $returnType = $this->compile($type->returnType);
                $parameters = implode(', ', array_map($this->compile(...), $type->parameters));
                return "new {$class}([{$parameters}], {$returnType})";
            case $type instanceof GenericType:
                $symbol = var_export($type->symbol, true);
                $innerType = $this->compile($type->innerType);
                return "new {$class}({$symbol}, {$innerType})";
            case $type instanceof UnresolvableType:
                $raw = var_export($type->toString(), true);
                $message = var_export($type->message(), true);
                return "new {$class}({$raw}, {$message})";
            default:
                throw new TypeCannotBeCompiled($type);
        }
    }
}