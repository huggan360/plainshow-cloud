<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser;

use OCA\Talk\Vendor\CuyZ\Valinor\Type\Parser\Exception\InvalidType;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Type;
use OCA\Talk\Vendor\CuyZ\Valinor\Type\Types\UnresolvableType;
use OCA\Talk\Vendor\CuyZ\Valinor\Utility\TypeHelper;
/** @internal */
final class VacantTypeAssignerParser implements TypeParser
{
    public function __construct(
        private TypeParser $delegate,
        /** @var array<non-empty-string, Type> */
        private array $vacantTypes
    )
    {
        if ($vacantTypes === []) {
            return;
        }
        foreach ($vacantTypes as $key => $vacantType) {
            try {
                $this->vacantTypes[$key] = TypeHelper::assignVacantTypes($vacantType, $vacantTypes);
            } catch (InvalidType $exception) {
                $this->vacantTypes[$key] = new UnresolvableType($vacantType->toString(), $exception->getMessage());
            }
        }
    }
    public function parse(string $raw): Type
    {
        $type = $this->delegate->parse($raw);
        if ($this->vacantTypes !== []) {
            $type = TypeHelper::assignVacantTypes($type, $this->vacantTypes);
        }
        return $type;
    }
}