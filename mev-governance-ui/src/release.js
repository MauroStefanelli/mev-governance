// Increment this value when publishing the next DEV release.
export const DEV_RELEASE = 'DEV_REL_033';

export function resolveRelease(runtime, build) {
  // Render does not expand {{SHORT_SHA}}. Never display unresolved placeholders.
  return [runtime, build].find(value => typeof value === 'string' && /^(DEV|PROD)_REL_\d+$/.test(value)) || DEV_RELEASE;
}
