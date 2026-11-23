// App Check for production: the reCAPTCHA Enterprise provider (hosted-cloud R2.1).
// The debug path is in appCheckDebug.ts and is not part of a production bundle.
// The site key is public by design. It comes from the build config, never from this file.

export interface ProductionAppCheckModule {
  initializeAppCheck(app: unknown, options: { provider: unknown; isTokenAutoRefreshEnabled: boolean }): unknown;
  ReCaptchaEnterpriseProvider: new (siteKey: string) => unknown;
}

export function startProductionAppCheck(app: unknown, appCheck: ProductionAppCheckModule, siteKey: string): unknown {
  return appCheck.initializeAppCheck(app, {
    provider: new appCheck.ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
