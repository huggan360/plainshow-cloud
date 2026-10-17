<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator;

use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Tree\Message\MessageBuilder;
use OCA\Talk\Vendor\CuyZ\Valinor\MapperBuilder;
use function preg_match;
/**
 * Restricts input keys to `snake_case` format when mapping data to objects or
 * shaped arrays. If a key does not match, a mapping error will be raised.
 *
 * ```
 * use OCA\Talk\Vendor\CuyZ\Valinor\MapperBuilder;
 * use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator\RestrictKeysToSnakeCase;
 *
 * $user = (new MapperBuilder())
 *     ->configureWith(new RestrictKeysToSnakeCase())
 *     ->mapper()
 *     ->map(User::class, [
 *         'first_name' => 'John', // Ok
 *         'lastName' => 'Doe',    // Error
 *     ]);
 * ```
 *
 * @api
 */
final class RestrictKeysToSnakeCase implements MapperBuilderConfigurator
{
    public function configureMapperBuilder(MapperBuilder $builder): MapperBuilder
    {
        return $builder->registerKeyConverter(
            // @phpstan-ignore argument.type
            static function (string $key): string {
                if (preg_match('/^[a-z0-9_]*$/', $key) === 0) {
                    throw MessageBuilder::newError('Key must follow the snake_case format.')->withCode('invalid_key_case')->build();
                }
                return $key;
            }
        );
    }
}