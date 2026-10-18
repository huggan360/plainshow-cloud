<?php
/**
 * The password step of a share link, in PlainShow's look. files_sharing
 * renders it; the form posts to its authenticate route.
 *
 * @var array{share: \OCP\Share\IShare, wrongpw?: bool} $_
 */
$base = \OC::$WEBROOT . '/apps/plainshow';
$v = substr(md5((string)@filemtime(__DIR__ . '/../ui/css/plainshow.css')), 0, 10);
$nonce = \OC::$server->get(\OC\Security\CSP\ContentSecurityPolicyNonceManager::class)->getNonce();
$share = $_['share'];
$owner = \OCP\Server::get(\OCP\IUserManager::class)->get($share->getShareOwner());
$action = \OCP\Server::get(\OCP\IURLGenerator::class)->linkToRoute('files_sharing.Share.authenticate', ['token' => $share->getToken(), 'redirect' => 'preview']);
?><!doctype html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark light">
    <meta name="robots" content="noindex">
    <title>Password needed | PlainShow Cloud</title>
    <link rel="icon" href="<?php p($base); ?>/ui/brand/favicon.ico?v=<?php p($v); ?>" sizes="any">
    <link rel="stylesheet" href="<?php p($base); ?>/ui/css/boxicons.css?v=<?php p($v); ?>">
    <link rel="stylesheet" href="<?php p($base); ?>/ui/css/plainshow.css?v=<?php p($v); ?>">
    <script nonce="<?php p($nonce); ?>">try { var t = localStorage.getItem('plainshow-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}</script>
    <style nonce="<?php p($nonce); ?>">
        .shareauth { display: grid; place-items: center; min-height: 100vh; padding: 24px 16px; }
        .shareauth__box { width: 100%; max-width: 420px; }
        .shareauth__brand { display: flex; justify-content: center; margin-bottom: 22px; }
        .shareauth__icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 14px; border-radius: 14px; background: var(--ps-accent-bg); color: var(--ps-accent); font-size: 1.6rem; }
        .shareauth h1 { margin: 0 0 6px; font: 600 var(--ps-text-xl) var(--ps-font-title); }
        .shareauth p { margin: 0 0 18px; color: var(--ps-text-soft); }
    </style>
</head>
<body class="ps">
<canvas class="ps-backdrop" aria-hidden="true"></canvas>
<main class="shareauth">
    <div class="shareauth__box">
        <div class="shareauth__brand">
            <a href="https://plainshow.se" class="ps-brand"><img class="ps-brand__logo" src="<?php p($base); ?>/ui/brand/plainshow-logo.webp?v=<?php p($v); ?>" alt="PlainShow" width="92" height="30"><span class="ps-brand__suffix">Cloud</span></a>
        </div>
        <section class="ps-frame">
            <div class="ps-frame__panel">
                <div class="shareauth__icon"><i class="bx bx-lock-alt" aria-hidden="true"></i></div>
                <h1>This link has a password</h1>
                <p><?php if ($owner): ?><?php p($owner->getDisplayName()); ?> shared something with you. <?php endif; ?>Enter the password you were given to open it.</p>
                <form method="post" action="<?php p($action); ?>">
                    <input type="hidden" name="requesttoken" value="<?php p(\OCP\Util::callRegister()); ?>">
                    <div class="ps-field">
                        <label class="ps-label" for="password">Password</label>
                        <input class="ps-input" id="password" name="password" type="password" autocomplete="current-password" required autofocus<?php if (!empty($_['wrongpw'])): ?> aria-invalid="true" aria-describedby="wrong"<?php endif; ?>>
                        <?php if (!empty($_['wrongpw'])): ?><p class="ps-error" id="wrong" role="alert">That password is not right. Try again.</p><?php endif; ?>
                    </div>
                    <button type="submit" class="ps-btn ps-btn--primary ps-btn--block"><i class="bx bx-lock-open-alt" aria-hidden="true"></i><span>Open</span></button>
                </form>
            </div>
        </section>
    </div>
</main>
<script nonce="<?php p($nonce); ?>" src="<?php p($base); ?>/ui/js/backdrop.js?v=<?php p($v); ?>" defer></script>
</body>
</html>
