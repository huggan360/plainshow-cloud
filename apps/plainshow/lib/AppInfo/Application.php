<?php

declare(strict_types=1);

namespace OCA\PlainShow\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCA\PlainShow\Listener\TakenDate;
use OCP\FilesMetadata\Event\MetadataBackgroundEvent;
use OCP\FilesMetadata\Event\MetadataLiveEvent;

class Application extends App implements IBootstrap {
    public const APP_ID = 'plainshow';

    public function __construct() {
        parent::__construct(self::APP_ID);
    }

    public function register(IRegistrationContext $context): void {
        // plainshow/kit and whatever else composer brought.
        $autoload = __DIR__ . '/../../vendor/autoload.php';
        if (is_file($autoload)) {
            require_once $autoload;
        }
        // When photos were taken, for the timeline.
        $context->registerEventListener(MetadataLiveEvent::class, TakenDate::class);
        $context->registerEventListener(MetadataBackgroundEvent::class, TakenDate::class);
    }

    public function boot(IBootContext $context): void {
    }
}
