/**
 * Analytics Configuration
 *
 * Mixpanel tokens are public (client-side) and safe to hardcode.
 * Token selection is determined at build time via NODE_ENV.
 */

export const MIXPANEL_CONFIG = {
  production: '0452faa178d97751d6c0b70bde3a3462',
  staging: 'a3991ba296baeff9cba7c572a094f064',
} as const;

export const MIXPANEL_TOKEN =
  process.env.NODE_ENV === 'production'
    ? MIXPANEL_CONFIG.production
    : MIXPANEL_CONFIG.staging;
