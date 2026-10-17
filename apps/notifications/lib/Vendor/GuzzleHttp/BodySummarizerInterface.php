<?php

namespace OCA\Notifications\Vendor\GuzzleHttp;

use OCA\Notifications\Vendor\Psr\Http\Message\MessageInterface;
interface BodySummarizerInterface
{
    /**
     * Returns a summarized message body.
     */
    public function summarize(MessageInterface $message): ?string;
}