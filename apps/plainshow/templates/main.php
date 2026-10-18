<?php
/** @var array $_ */
$base = \OC::$WEBROOT . '/apps/plainshow';
$v = $_['version'];
$nonce = \OC::$server->get(\OC\Security\CSP\ContentSecurityPolicyNonceManager::class)->getNonce();
?><!doctype html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark light">
    <meta name="theme-color" content="#151515">
    <title>Cloud | PlainShow</title>
    <link rel="icon" href="<?php p($base); ?>/ui/brand/favicon.ico?v=<?php p($v); ?>" sizes="any">
    <link rel="apple-touch-icon" href="<?php p($base); ?>/ui/brand/apple-touch-icon.png?v=<?php p($v); ?>">
    <link rel="preload" href="<?php p($base); ?>/ui/fonts/outfit-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="<?php p($base); ?>/ui/css/boxicons.css?v=<?php p($v); ?>">
    <link rel="stylesheet" href="<?php p($base); ?>/ui/css/plainshow.css?v=<?php p($v); ?>">
    <link rel="stylesheet" href="<?php p($base); ?>/js/cloud.css?v=<?php p($v); ?>">
    <script nonce="<?php p($nonce); ?>">try { var t = localStorage.getItem('plainshow-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}</script>
</head>
<body class="ps cloud">
<canvas class="ps-backdrop" aria-hidden="true"></canvas>
<div id="cloud"></div>
<script type="application/json" id="cloud-boot"><?php print_unescaped(json_encode($_['boot'] + ['assets' => $base, 'version' => $v], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES)); ?></script>
<script nonce="<?php p($nonce); ?>" src="<?php p($base); ?>/ui/js/backdrop.js?v=<?php p($v); ?>" defer></script>
<script nonce="<?php p($nonce); ?>" type="module" src="<?php p($base); ?>/js/cloud.js?v=<?php p($v); ?>"></script>
</body>
</html>
