<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator;

use OCA\Talk\Vendor\CuyZ\Valinor\MapperBuilder;
use function lcfirst;
use function str_replace;
use function ucwords;
/**
 * Converts the keys of input data to `camelCase` before mapping them to object
 * properties or shaped array keys. This allows accepting data with a different
 * naming convention than the one used in the PHP codebase.
 *
 * A typical use case is mapping a JSON API payload that uses `snake_case` keys
 * to PHP objects that follow the `camelCase` convention:
 *
 * ```
 * use OCA\Talk\Vendor\CuyZ\Valinor\MapperBuilder;
 * use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator\ConvertKeysToCamelCase;
 *
 * $user = (new MapperBuilder())
 *     ->configureWith(new ConvertKeysToCamelCase())
 *     ->mapper()
 *     ->map(User::class, [
 *         'first_name' => 'John', // mapped to `$firstName`
 *         'last_name' => 'Doe',   // mapped to `$lastName`
 *     ]);
 * ```
 *
 * This configurator can be combined with a key restriction configurator to both
 * validate and convert keys in a single step. The restriction configurator must
 * be registered *before* the conversion so that the validation runs on the
 * original input keys.
 *
 * - {@see RestrictKeysToSnakeCase}
 * - {@see RestrictKeysToKebabCase}
 * - {@see RestrictKeysToPascalCase}
 *
 * ```
 * use OCA\Talk\Vendor\CuyZ\Valinor\MapperBuilder;
 * use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator\ConvertKeysToCamelCase;
 * use OCA\Talk\Vendor\CuyZ\Valinor\Mapper\Configurator\RestrictKeysToSnakeCase;
 *
 * $user = (new MapperBuilder())
 *     ->configureWith(
 *         new RestrictKeysToSnakeCase(),
 *         new ConvertKeysToCamelCase(),
 *     )
 *     ->mapper()
 *     ->map(User::class, [
 *         'first_name' => 'John',
 *         'last_name' => 'Doe',
 *     ]);
 * ```
 *
 * @api
 */
final class ConvertKeysToCamelCase implements MapperBuilderConfigurator
{
    public function configureMapperBuilder(MapperBuilder $builder): MapperBuilder
    {
        return $builder->registerKeyConverter(static fn(string $key): string => lcfirst(str_replace(['_', '-'], '', ucwords($key, '_-'))));
    }
}