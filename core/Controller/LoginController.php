<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2016-2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-FileCopyrightText: 2016 ownCloud, Inc.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
namespace OC\Core\Controller;

use OC\AppFramework\Http\Request;
use OC\Authentication\Login\Chain;
use OC\Authentication\Login\LoginData;
use OC\Authentication\WebAuthn\Manager as WebAuthnManager;
use OC\User\Session;
use OC_App;
use OCA\User_LDAP\Configuration;
use OCA\User_LDAP\Helper;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\BruteForceProtection;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\Attribute\UseSession;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\StandaloneTemplateResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Defaults;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Notification\IManager;
use OCP\Security\Bruteforce\IThrottler;
use OCP\Security\ITrustedDomainHelper;
use OCP\Server;
use OCP\Util;

class LoginController extends Controller {
	public const LOGIN_MSG_INVALIDPASSWORD = 'invalidpassword';
	public const LOGIN_MSG_USERDISABLED = 'userdisabled';
	public const LOGIN_MSG_CSRFCHECKFAILED = 'csrfCheckFailed';
	public const LOGIN_MSG_INVALID_ORIGIN = 'invalidOrigin';

	public function __construct(
		?string $appName,
		IRequest $request,
		private IUserManager $userManager,
		private IConfig $config,
		private ISession $session,
		private Session $userSession,
		private IURLGenerator $urlGenerator,
		private Defaults $defaults,
		private IThrottler $throttler,
		private IInitialState $initialState,
		private WebAuthnManager $webAuthnManager,
		private IManager $manager,
		private IL10N $l10n,
		private IAppManager $appManager,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * @return RedirectResponse
	 */
	#[NoAdminRequired]
	#[UseSession]
	#[FrontpageRoute(verb: 'GET', url: '/logout')]
	public function logout() {
		$loginToken = $this->request->getCookie('nc_token');
		$uid = $this->userSession->getUser()?->getUID();
		if ($loginToken !== null && $uid !== null) {
			$this->config->deleteUserValue($uid, 'login_token', $loginToken);
		}
		$this->userSession->logout();

		$response = new RedirectResponse($this->urlGenerator->linkToRouteAbsolute(
			'core.login.showLoginForm',
			['clear' => true] // this param the code in login.js may be removed when the "Clear-Site-Data" is working in the browsers
		));

		$this->session->set('clearingExecutionContexts', '1');
		$this->session->close();

		if (
			$this->request->getServerProtocol() === 'https'
			&& !$this->request->isUserAgent([Request::USER_AGENT_CHROME, Request::USER_AGENT_ANDROID_MOBILE_CHROME])
		) {
			$response->addHeader('Clear-Site-Data', '"cache", "storage"');
		}

		if ($uid !== null) {
			$response->addHeader('X-User-Id', $uid);
		}

		return $response;
	}

	/**
	 * @param string $user
	 * @param string $redirect_url
	 *
	 * @return TemplateResponse|RedirectResponse
	 */
	#[NoCSRFRequired]
	#[PublicPage]
	#[UseSession]
	#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
	#[FrontpageRoute(verb: 'GET', url: '/login')]
	public function showLoginForm(?string $user = null, ?string $redirect_url = null): Response {
		if ($this->userSession->isLoggedIn()) {
			return new RedirectResponse($this->urlGenerator->linkToDefaultPageUrl());
		}

		// PlainShow Cloud has no password form: signing in is PlainShow's,
		// through the sign-in user_oidc registers.
		foreach (OC_App::getAlternativeLogIns() as $login) {
			$href = (string)($login['href'] ?? '');
			if ($href === '') {
				continue;
			}
			if (!empty($redirect_url) && !str_contains($href, 'redirectUrl=')) {
				$href .= (str_contains($href, '?') ? '&' : '?') . 'redirectUrl=' . urlencode($redirect_url);
			}
			return new RedirectResponse($href);
		}
		return new StandaloneTemplateResponse($this->appName, 'error', ['errors' => [['error' => 'Signing in is through PlainShow', 'hint' => 'PlainShow sign-in is not set up on this server yet.']]], 'guest');
	}

	#[NoCSRFRequired]
	#[PublicPage]
	#[BruteForceProtection(action: 'login')]
	#[UseSession]
	#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
	#[FrontpageRoute(verb: 'POST', url: '/login')]
	public function tryLogin(?string $redirect_url = null): RedirectResponse {
		// No password sign-in in PlainShow Cloud: everyone signs in with PlainShow.
		return new RedirectResponse($this->urlGenerator->linkToRoute('core.login.showLoginForm', ['redirect_url' => $redirect_url]));
	}

	/**
	 * Confirm the user password
	 *
	 * @license GNU AGPL version 3 or any later version
	 *
	 * @param string $password The password of the user
	 *
	 * @return DataResponse<Http::STATUS_OK, array{lastLogin: int}, array{}>|DataResponse<Http::STATUS_FORBIDDEN, list<empty>, array{}>
	 *
	 * 200: Password confirmation succeeded
	 * 403: Password confirmation failed
	 */
	#[NoAdminRequired]
	#[BruteForceProtection(action: 'sudo')]
	#[UseSession]
	#[NoCSRFRequired]
	#[FrontpageRoute(verb: 'POST', url: '/login/confirm')]
	#[OpenAPI(scope: OpenAPI::SCOPE_DEFAULT)]
	public function confirmPassword(string $password): DataResponse {
		$loginName = $this->userSession->getLoginName();
		$loginResult = $this->userManager->checkPassword($loginName, $password);
		if ($loginResult === false) {
			$response = new DataResponse([], Http::STATUS_FORBIDDEN);
			$response->throttle(['loginName' => $loginName]);
			return $response;
		}

		$confirmTimestamp = time();
		$this->session->set('last-password-confirm', $confirmTimestamp);
		$this->throttler->resetDelay($this->request->getRemoteAddress(), 'sudo', ['loginName' => $loginName]);
		return new DataResponse(['lastLogin' => $confirmTimestamp], Http::STATUS_OK);
	}
}
