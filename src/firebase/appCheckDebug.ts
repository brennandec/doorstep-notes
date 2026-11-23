// App Check, debug provider for dev and e2e builds only (sdk-facts 34, 35).
// The debug token is printed by the SDK to the browser console; it is never written to a file.
// Only cloudService.ts loads this module, through a dynamic import behind a check of the build
// mode, so a production bundle does not hold it (hosted-cloud R1.1).

export interface AppCheckDeps {
  scope: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string };
  initializeAppCheck(app: unknown, options: { provider: unknown; isTokenAutoRefreshEnabled: boolean }): unknown;
  /** Builds the provider object the SDK requires; ignored by the SDK in debug mode. */
  makeProvider(): unknown;
}

export function initAppCheckDebug(app: unknown, deps: AppCheckDeps): unknown {
  // Must be set before initializeAppCheck. A token string already set (the owner's registered debug
  // token, put there by the page that starts the app) is kept; otherwise the SDK makes one and prints it.
  if (typeof deps.scope.FIREBASE_APPCHECK_DEBUG_TOKEN !== "string") deps.scope.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  return deps.initializeAppCheck(app, { provider: deps.makeProvider(), isTokenAutoRefreshEnabled: true });
}

interface DebugAppCheckModule {
  initializeAppCheck(app: unknown, options: { provider: unknown; isTokenAutoRefreshEnabled: boolean }): unknown;
  CustomProvider: new (options: { getToken(): Promise<{ token: string; expireTimeMillis: number }> }) => unknown;
}

/**
 * Starts App Check in debug mode. In debug mode the SDK asks for its debug token and ignores the
 * provider, which it still requires. The provider here is a CustomProvider that gives no token of its
 * own, so nothing but the registered debug token can pass.
 */
export function startDebugAppCheck(app: unknown, appCheck: DebugAppCheckModule): unknown {
  return initAppCheckDebug(app, {
    scope: globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string },
    initializeAppCheck: (a, options) => appCheck.initializeAppCheck(a, options),
    makeProvider: () =>
      new appCheck.CustomProvider({
        getToken: async () => {
          throw new Error("No App Check token without the registered debug token.");
        },
      }),
  });
}
