import { DEV_RELEASE, resolveRelease } from './release';

test('displays the published version instead of unresolved Render placeholders', () => {
  expect(resolveRelease('DEV_REL_{{SHORT_SHA}}', 'DEV_REL_{{SHORT_SHA}}')).toBe(DEV_RELEASE);
  expect(resolveRelease(undefined, undefined)).toBe(DEV_RELEASE);
});

test('prefers a valid runtime release and supports production build versions', () => {
  expect(resolveRelease('DEV_REL_005', 'DEV_REL_004')).toBe('DEV_REL_005');
  expect(resolveRelease('', 'PROD_REL_003')).toBe('PROD_REL_003');
});
