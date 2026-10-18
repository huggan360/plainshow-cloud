<?php

declare(strict_types=1);

namespace OCA\PlainShow\Listener;

use DateTimeImmutable;
use DateTimeZone;
use OCA\PlainShow\Service\Photos;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\File;
use OCP\FilesMetadata\Event\MetadataBackgroundEvent;
use OCP\FilesMetadata\Event\MetadataLiveEvent;
use Throwable;

/**
 * When a photo or video was taken, for the timeline: the camera's date
 * (EXIF DateTimeOriginal) or the date in a phone's file name
 * (IMG_20260815_142233.jpg, PXL_..., VID_..., "2026-08-15 14.22.33.jpg").
 * Stored as photos-original_date_time, the key the old Photos app used, so
 * earlier photos keep theirs. Reading EXIF waits for the background job.
 *
 * @template-implements IEventListener<MetadataLiveEvent|MetadataBackgroundEvent>
 */
class TakenDate implements IEventListener {
    private const ZONE = 'Europe/Stockholm';

    public function handle(Event $event): void {
        if (!$event instanceof MetadataLiveEvent && !$event instanceof MetadataBackgroundEvent) {
            return;
        }
        $node = $event->getNode();
        if (!$node instanceof File || !preg_match('#^(image|video)/#', $node->getMimetype())) {
            return;
        }
        $metadata = $event->getMetadata();
        $fromName = $this->fromName($node->getName());
        $exif = in_array($node->getMimetype(), ['image/jpeg', 'image/tiff'], true);

        if ($event instanceof MetadataLiveEvent) {
            if ($fromName !== null && !$metadata->hasKey(Photos::TAKEN)) {
                $metadata->setInt(Photos::TAKEN, $fromName, true);
            }
            if ($exif) {
                $event->requestBackgroundJob();
            }
            return;
        }

        $taken = ($exif ? $this->fromExif($node) : null) ?? $fromName;
        if ($taken !== null) {
            $metadata->setInt(Photos::TAKEN, $taken, true);
        }
    }

    private function fromExif(File $file): ?int {
        try {
            $stream = $file->fopen('rb');
            if ($stream === false) {
                return null;
            }
            $data = @exif_read_data($stream, 'EXIF');
            fclose($stream);
        } catch (Throwable) {
            return null;
        }
        $value = $data['DateTimeOriginal'] ?? $data['DateTimeDigitized'] ?? null;
        if (!is_string($value) || !preg_match('/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/', $value, $m) || $m[1] < 1900) {
            return null;
        }
        return $this->stamp($m[1], $m[2], $m[3], $m[4], $m[5], $m[6]);
    }

    private function fromName(string $name): ?int {
        if (preg_match('/(?:^|[^0-9])((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])[ _T-]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})/', $name, $m)) {
            return $this->stamp($m[1], $m[2], $m[3], $m[4], $m[5], $m[6]);
        }
        return null;
    }

    private function stamp(string $y, string $mo, string $d, string $h, string $mi, string $s): ?int {
        if ((int)$h > 23 || (int)$mi > 59 || (int)$s > 59) {
            return null;
        }
        $date = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', "$y-$mo-$d $h:$mi:$s", new DateTimeZone(self::ZONE));
        return $date ? $date->getTimestamp() : null;
    }
}
