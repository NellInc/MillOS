// Installed Chrome clones its whole app bundle (~2 GB) into
// $TMPDIR/../X/com.google.Chrome.code_sign_clone on every launch and removes
// the clone only on a clean exit. Automation launches that end in a kill leave
// it behind: 165 leaked clones filled the disk in 25 hours (2026-11-06).
// Disabling the MacAppCodeSignClone feature stops the clone being made.
//
// Chrome honours only the LAST --disable-features switch, so passing ours alone
// would silently re-enable everything Playwright disables. This repeats
// Playwright 1.64.1's own list and merges in any caller-supplied entries.
// Working if a Playwright launch through this helper adds no directory under
// com.google.Chrome.code_sign_clone, and Browser.getBrowserCommandLine shows one
// --disable-features value containing both MacAppCodeSignClone and Translate.
const PLAYWRIGHT_DISABLED_FEATURES = [
  'AvoidUnnecessaryBeforeUnloadCheckSync',
  'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider',
  'GlobalMediaControls',
  'HttpsUpgrades',
  'LensOverlay',
  'MediaRouter',
  'PaintHolding',
  'ThirdPartyStoragePartitioning',
  'BlockOriginHeaderModificationOnRedirect',
  'AvoidCorsURLLoaderRestartOnRedirect',
  'Translate',
  'AutoDeElevate',
  'OptimizationHints',
  'NetworkTimeServiceQuerying',
  'AimEnabled',
  'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion',
];

const PREFIX = '--disable-features=';

/** Returns `args` with one merged --disable-features switch that includes MacAppCodeSignClone. */
export function withChromeLeakGuard(args = []) {
  const kept = [];
  const disabled = [...PLAYWRIGHT_DISABLED_FEATURES];
  for (const argument of args) {
    if (argument.startsWith(PREFIX)) disabled.push(...argument.slice(PREFIX.length).split(','));
    else kept.push(argument);
  }
  disabled.push('MacAppCodeSignClone');
  return [...kept, PREFIX + [...new Set(disabled.filter(Boolean))].join(',')];
}
