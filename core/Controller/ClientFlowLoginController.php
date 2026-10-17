<?php

/**
 * SPDX-FileCopyrightText: 2017 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OC\Core\Controller;

use OC\Authentication\Events\AppPasswordCreatedEvent;
use OC\Authentication\Exceptions\PasswordlessTokenException;
use OC\Authentication\Token\IProvider;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\NoSameSiteCookieRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PasswordConfirmationRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\Attribute\UseSession;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StandaloneTemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Authentication\Exceptions\InvalidTokenException;
use OCP\Authentication\Token\IToken;
use OCP\Defaults;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Security\ISecureRandom;
use OCP\Session\Exceptions\SessionNotAvailableException;
use OCP\Util;

/**
 * Login Flow v1, which the phone apps open in a web view: sign in, then a new
 * app password goes back to the app through nc://login. PlainShow Cloud has no
 * OAuth2 clients, so only that path is left.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class ClientFlowLoginController extends Controller {
	public const STATE_NAME = 'client.flow.state.token';

	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IL10N $l10n,
		private Defaults $defaults,
		private ISession $session,
		private IProvider $tokenProvider,
		private ISecureRandom $random,
		private IURLGenerator $urlGenerator,
		private IEventDispatcher $eventDispatcher,
		private ITimeFactory $timeFactory,
		private IConfig $config,
		private IInitialState $initialState,
	) {
		parent::__construct($appName, $request);
	}

	private function getClientName(): string {
		$userAgent = $this->request->getHeader('user-agent');
		return $userAgent !== '' ? $userAgent : 'unknown';
	}

	private function isValidToken(string $stateToken): bool {
		$currentToken = $this->session->get(self::STATE_NAME);
		if (!is_string($currentToken)) {
			return false;
		}
		return hash_equals($currentToken, $stateToken);
	}

	private function stateTokenForbiddenResponse(): StandaloneTemplateResponse {
		$response = new StandaloneTemplateResponse(
			$this->appName,
			'403',
			[
				'message' => $this->l10n->t('State token does not match'),
			],
			'guest'
		);
		$response->setStatus(Http::STATUS_FORBIDDEN);
		return $response;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	#[UseSession]
	#[FrontpageRoute(verb: 'GET', url: '/login/flow')]
	public function showAuthPickerPage(string $clientIdentifier = '', string $user = '', int $direct = 0, string $providedRedirectUri = ''): StandaloneTemplateResponse {
		$clientName = $this->getClientName();

		// Only the apps, which send the API request header. OAuth2 clients are gone.
		$clientRequest = $this->request->getHeader('OCS-APIREQUEST');
		if ($clientRequest !== 'true' || $clientIdentifier !== '') {
			return new StandaloneTemplateResponse(
				$this->appName,
				'error',
				[
					'errors'
					=> [
						[
							'error' => 'Access Forbidden',
							'hint' => 'Invalid request',
						],
					],
				],
				'guest'
			);
		}

		$stateToken = $this->random->generate(
			64,
			ISecureRandom::CHAR_LOWER . ISecureRandom::CHAR_UPPER . ISecureRandom::CHAR_DIGITS
		);
		$this->session->set(self::STATE_NAME, $stateToken);

		$csp = new ContentSecurityPolicy();
		$csp->addAllowedFormActionDomain('nc://*');

		$this->initialState->provideInitialState('loginFlowState', 'auth');
		$this->initialState->provideInitialState('loginFlowAuth', [
			'client' => $clientName,
			'clientIdentifier' => $clientIdentifier,
			'instanceName' => $this->defaults->getName(),
			'stateToken' => $stateToken,
			'serverHost' => $this->getServerPath(),
			'oauthState' => $this->session->get('oauth.state'),
			'direct' => (bool)$direct,
			'providedRedirectUri' => $providedRedirectUri,
			'loginRedirectUrl' => $this->urlGenerator->linkToRoute(
				'core.ClientFlowLogin.grantPage',
				[
					'stateToken' => $stateToken,
					'clientIdentifier' => $clientIdentifier,
					'oauthState' => $this->session->get('oauth.state'),
					'user' => $user,
					'direct' => $direct,
					'providedRedirectUri' => $providedRedirectUri,
				]),
			'appTokenUrl' => $this->urlGenerator->linkToRouteAbsolute('core.ClientFlowLogin.apptokenRedirect'),
		]);


		Util::addScript('core', 'login_flow');
		$response = new StandaloneTemplateResponse(
			$this->appName,
			'loginflow',
			renderAs: 'guest'
		);
		$response->setContentSecurityPolicy($csp);
		return $response;
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[UseSession]
	#[FrontpageRoute(verb: 'GET', url: '/login/flow/grant')]
	#[NoSameSiteCookieRequired]
	public function grantPage(
		string $stateToken = '',
		string $clientIdentifier = '',
		int $direct = 0,
		string $providedRedirectUri = '',
	): Response {
		if (!$this->isValidToken($stateToken)) {
			return $this->stateTokenForbiddenResponse();
		}

		if ($clientIdentifier !== '') {
			return $this->stateTokenForbiddenResponse();
		}
		$clientName = $this->getClientName();

		$csp = new ContentSecurityPolicy();
		$csp->addAllowedFormActionDomain('nc://*');

		$user = $this->userSession->getUser();
		\assert($user !== null);

		$this->initialState->provideInitialState('loginFlowState', 'grant');
		$this->initialState->provideInitialState('loginFlowGrant', [
			'actionUrl' => $this->urlGenerator->linkToRouteAbsolute(
				'core.ClientFlowLogin.generateAppPassword',
			),
			'client' => $clientName,
			'clientIdentifier' => $clientIdentifier,
			'instanceName' => $this->defaults->getName(),
			'stateToken' => $stateToken,
			'serverHost' => $this->getServerPath(),
			'oauthState' => $this->session->get('oauth.state'),
			'direct' => $direct,
			'providedRedirectUri' => $providedRedirectUri,
			'userDisplayName' => $user->getDisplayName(),
			'userId' => $user->getUID(),
		]);

		Util::addScript('core', 'login_flow');
		$response = new StandaloneTemplateResponse(
			$this->appName,
			'loginflow',
			renderAs: 'guest'
		);

		$response->setContentSecurityPolicy($csp);
		return $response;
	}

	#[NoAdminRequired]
	#[UseSession]
	#[PasswordConfirmationRequired(strict: false)]
	#[FrontpageRoute(verb: 'POST', url: '/login/flow')]
	public function generateAppPassword(
		string $stateToken,
		string $clientIdentifier = '',
		string $providedRedirectUri = '',
	): Response {
		if (!$this->isValidToken($stateToken)) {
			$this->session->remove(self::STATE_NAME);
			return $this->stateTokenForbiddenResponse();
		}

		$this->session->remove(self::STATE_NAME);

		try {
			$sessionId = $this->session->getId();
		} catch (SessionNotAvailableException $ex) {
			$response = new Response();
			$response->setStatus(Http::STATUS_FORBIDDEN);
			return $response;
		}

		try {
			$sessionToken = $this->tokenProvider->getToken($sessionId);
			$loginName = $sessionToken->getLoginName();
			try {
				$password = $this->tokenProvider->getPassword($sessionToken, $sessionId);
			} catch (PasswordlessTokenException $ex) {
				$password = null;
			}
		} catch (InvalidTokenException $ex) {
			$response = new Response();
			$response->setStatus(Http::STATUS_FORBIDDEN);
			return $response;
		}

		if ($clientIdentifier !== '') {
			return $this->stateTokenForbiddenResponse();
		}
		$clientName = $this->getClientName();

		$token = $this->random->generate(72, ISecureRandom::CHAR_UPPER . ISecureRandom::CHAR_LOWER . ISecureRandom::CHAR_DIGITS);
		$uid = $this->userSession->getUser()->getUID();
		$generatedToken = $this->tokenProvider->generateToken(
			$token,
			$uid,
			$loginName,
			$password,
			$clientName,
			IToken::PERMANENT_TOKEN,
			IToken::DO_NOT_REMEMBER
		);

		$redirectUri = 'nc://login/server:' . $this->getServerPath() . '&user:' . urlencode($loginName) . '&password:' . urlencode($token);

		// Clear the token from the login here
		$this->tokenProvider->invalidateToken($sessionId);

		$this->eventDispatcher->dispatchTyped(
			new AppPasswordCreatedEvent($generatedToken)
		);

		return new RedirectResponse($redirectUri);
	}

	#[PublicPage]
	#[FrontpageRoute(verb: 'POST', url: '/login/flow/apptoken')]
	public function apptokenRedirect(string $stateToken, string $user, string $password): Response {
		if (!$this->isValidToken($stateToken)) {
			return $this->stateTokenForbiddenResponse();
		}

		try {
			$token = $this->tokenProvider->getToken($password);
			if ($token->getLoginName() !== $user) {
				throw new InvalidTokenException('login name does not match');
			}
		} catch (InvalidTokenException $e) {
			$response = new StandaloneTemplateResponse(
				$this->appName,
				'403',
				[
					'message' => $this->l10n->t('Invalid app password'),
				],
				'guest'
			);
			$response->setStatus(Http::STATUS_FORBIDDEN);
			return $response;
		}

		$redirectUri = 'nc://login/server:' . $this->getServerPath() . '&user:' . urlencode($user) . '&password:' . urlencode($password);
		return new RedirectResponse($redirectUri);
	}

	private function getServerPath(): string {
		$serverPostfix = '';

		if (str_contains($this->request->getRequestUri(), '/index.php')) {
			$serverPostfix = substr($this->request->getRequestUri(), 0, strpos($this->request->getRequestUri(), '/index.php'));
		} elseif (str_contains($this->request->getRequestUri(), '/login/flow')) {
			$serverPostfix = substr($this->request->getRequestUri(), 0, strpos($this->request->getRequestUri(), '/login/flow'));
		}

		$protocol = $this->request->getServerProtocol();

		if ($protocol !== 'https') {
			$xForwardedProto = $this->request->getHeader('X-Forwarded-Proto');
			$xForwardedSSL = $this->request->getHeader('X-Forwarded-Ssl');
			if ($xForwardedProto === 'https' || $xForwardedSSL === 'on') {
				$protocol = 'https';
			}
		}

		return $protocol . '://' . $this->request->getServerHost() . $serverPostfix;
	}
}
