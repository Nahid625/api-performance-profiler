import { checkLoadRun, LoadRunRequest } from './guard';
import { RecordedRequest } from './recorder';

function recording(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
  return {
    method: 'GET',
    route: '/users/:id',
    url: '/users/42',
    origin: 'http://127.0.0.1:3000',
    headers: {},
    body: undefined,
    bodyUnavailable: false,
    recordedAt: 0,
    ...overrides,
  };
}

function run(overrides: Partial<LoadRunRequest> = {}): LoadRunRequest {
  return {
    method: 'GET',
    route: '/users/:id',
    target: 'http://127.0.0.1:3000',
    recording: recording(),
    env: undefined,
    ...overrides,
  };
}

function reasonOf(overrides: Partial<LoadRunRequest>): string {
  const check = checkLoadRun(run(overrides));
  if (check.ok) {
    throw new Error('expected the run to be refused');
  }
  return check.reason;
}

describe('checkLoadRun', () => {
  it('allows a recorded GET against localhost outside production', () => {
    expect(checkLoadRun(run())).toEqual({ ok: true });
  });

  describe('production', () => {
    it.each(['production', 'staging', 'prod'])('refuses when NODE_ENV is %s', (env) => {
      expect(reasonOf({ env })).toContain('disabled when NODE_ENV');
    });

    it.each([undefined, 'development', 'test'])('allows when NODE_ENV is %p', (env) => {
      expect(checkLoadRun(run({ env }))).toEqual({ ok: true });
    });

    it('names production before any other reason', () => {
      const reason = reasonOf({ env: 'production', recording: undefined, method: 'POST' });
      expect(reason).toContain('disabled when NODE_ENV');
    });
  });

  describe('recording', () => {
    it('refuses a route with no recording and says what to do', () => {
      const reason = reasonOf({ recording: undefined });
      expect(reason).toContain('GET /users/:id has no recording');
      expect(reason).toContain('send one successful request');
    });
  });

  describe('body', () => {
    it('refuses a recording whose body was never captured', () => {
      const reason = reasonOf({
        method: 'POST',
        route: '/raw',
        recording: recording({ method: 'POST', route: '/raw', bodyUnavailable: true }),
        allowLoadOn: ['POST /raw'],
      });
      expect(reason).toContain('no parser captured');
    });
  });

  describe('method', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses %s by default', (method) => {
      const reason = reasonOf({ method, route: '/login', recording: recording({ method }) });
      expect(reason).toContain(`${method} /login is not GET`);
      expect(reason).toContain('allowLoadOn');
    });

    it('allows a non-GET route that is allow-listed', () => {
      const check = checkLoadRun(
        run({
          method: 'POST',
          route: '/search',
          recording: recording({ method: 'POST', route: '/search' }),
          allowLoadOn: ['POST /search'],
        }),
      );
      expect(check).toEqual({ ok: true });
    });

    it('matches the allow-list on the route template, not the real path', () => {
      const reason = reasonOf({
        method: 'POST',
        route: '/users/:id',
        recording: recording({ method: 'POST', url: '/users/42' }),
        allowLoadOn: ['POST /users/42'],
      });
      expect(reason).toContain('not GET');
    });

    it('does not let an allow-list entry for one method unlock another', () => {
      const reason = reasonOf({
        method: 'DELETE',
        route: '/search',
        recording: recording({ method: 'DELETE', route: '/search' }),
        allowLoadOn: ['POST /search'],
      });
      expect(reason).toContain('DELETE /search is not GET');
    });

    it('is harmless to allow-list a GET', () => {
      expect(checkLoadRun(run({ allowLoadOn: ['GET /users/:id'] }))).toEqual({ ok: true });
    });
  });

  describe('target', () => {
    it.each([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://[::1]:3000',
      'https://localhost',
      'http://localhost:3000/base/path',
    ])('allows %s', (target) => {
      expect(checkLoadRun(run({ target }))).toEqual({ ok: true });
    });

    it.each([
      ['http://api.example.com', 'api.example.com'],
      ['http://192.168.1.10:3000', '192.168.1.10'],
      ['http://localhost.example.com', 'localhost.example.com'],
      ['http://127.0.0.1.nip.io', '127.0.0.1.nip.io'],
      ['http://0.0.0.0:3000', '0.0.0.0'],
    ])('refuses %s', (target, host) => {
      expect(reasonOf({ target })).toBe(`target must be localhost, got ${host}`);
    });

    it.each(['', 'localhost:3000', '127.0.0.1', 'not a url', 'ftp://localhost', 'file:///tmp'])(
      'refuses a target that is not a full http URL: %p',
      (target) => {
        expect(reasonOf({ target })).toContain('full http(s) URL');
      },
    );
  });
});
