<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Exception\InvalidMappingTypeSignature;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Exception\MappingLogicalException;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Exception\TypeErrorDuringMapping;
use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\RootNodeBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\TypeParser;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
/** @internal */
final class TypeTreeMapper implements TreeMapper
{
    public function __construct(private TypeParser $typeParser, private RootNodeBuilder $nodeBuilder)
    {
    }
    /** @pure */
    public function map(string $signature, mixed $source): mixed
    {
        $type = $this->typeParser->parse($signature);
        if ($type instanceof UnresolvableType) {
            throw new InvalidMappingTypeSignature($type);
        }
        try {
            $node = $this->nodeBuilder->build($source, $type);
        } catch (MappingLogicalException $exception) {
            throw new TypeErrorDuringMapping($type, $exception);
        }
        if (!$node->isValid()) {
            throw new TypeTreeMapperError($source, $type->toString(), $node->messages());
        }
        return $node->value();
    }
}