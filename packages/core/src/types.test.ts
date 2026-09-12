import { isSuccess, UNMATCHED_ROUTE } from './types';

describe('isSuccess', () => {
  it.each([200, 201, 204, 302, 399])('treats %i as success', (code) => {
    expect(isSuccess(code)).toBe(true);
  });

  it.each([400, 401, 404, 422, 500, 503])('treats %i as failure', (code) => {
    expect(isSuccess(code)).toBe(false);
  });
});

describe('UNMATCHED_ROUTE', () => {
  it('cannot collide with a real route path', () => {
    expect(UNMATCHED_ROUTE.startsWith('/')).toBe(false);
  });
});
