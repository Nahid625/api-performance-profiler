import { UNMATCHED_ROUTE } from '@api-profiler/core';
import { MAX_RECORDED_BODY_BYTES, RequestRecorder, RequestSnapshot } from './recorder';

function snapshot(overrides: Partial<RequestSnapshot> = {}): RequestSnapshot {
  return {
    method: 'GET',
    route: '/users/:id',
    url: '/users/42',
    origin: 'http://127.0.0.1:3000',
    headers: { authorization: 'Bearer abc123xyz' },
    body: undefined,
    bodyUnavailable: false,
    ...overrides,
  };
}

describe('RequestRecorder', () => {
  it('keeps a successful observed request', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot(), 200, 'observed');

    expect(recorder.get('GET', '/users/:id')).toMatchObject({
      method: 'GET',
      route: '/users/:id',
      url: '/users/42',
      headers: { authorization: 'Bearer abc123xyz' },
      bodyUnavailable: false,
    });
  });

  it('stamps when the request was recorded', () => {
    const recorder = new RequestRecorder();
    const before = Date.now();
    recorder.record(snapshot(), 200, 'observed');

    const recordedAt = recorder.get('GET', '/users/:id')?.recordedAt ?? 0;
    expect(recordedAt).toBeGreaterThanOrEqual(before);
    expect(recordedAt).toBeLessThanOrEqual(Date.now());
  });

  it('replaces the older recording with the newest one', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ url: '/users/42' }), 200, 'observed');
    recorder.record(snapshot({ url: '/users/7' }), 200, 'observed');

    expect(recorder.get('GET', '/users/:id')?.url).toBe('/users/7');
    expect(recorder.all()).toHaveLength(1);
  });

  it('keeps one recording per method and route', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ route: '/users/:id' }), 200, 'observed');
    recorder.record(snapshot({ route: '/orders', url: '/orders' }), 200, 'observed');
    recorder.record(snapshot({ method: 'POST', route: '/orders', url: '/orders' }), 201, 'observed');

    expect(recorder.all()).toHaveLength(3);
  });

  it.each([200, 201, 204, 299])('records status %i', (status) => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot(), status, 'observed');
    expect(recorder.get('GET', '/users/:id')).toBeDefined();
  });

  it.each([101, 301, 304, 400, 401, 404, 500])('does not record status %i', (status) => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot(), status, 'observed');
    expect(recorder.get('GET', '/users/:id')).toBeUndefined();
  });

  it('keeps the previous recording when a later request fails', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ url: '/users/42' }), 200, 'observed');
    recorder.record(snapshot({ url: '/users/999' }), 404, 'observed');

    expect(recorder.get('GET', '/users/:id')?.url).toBe('/users/42');
  });

  it('never lets load traffic overwrite a recording', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ url: '/users/42' }), 200, 'observed');
    recorder.record(snapshot({ url: '/users/load' }), 200, 'load');

    expect(recorder.get('GET', '/users/:id')?.url).toBe('/users/42');
  });

  it('never records unmatched requests', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ route: UNMATCHED_ROUTE, url: '/style.css' }), 200, 'observed');

    expect(recorder.all()).toEqual([]);
  });

  describe('body size', () => {
    it('records a body exactly at the limit', () => {
      const recorder = new RequestRecorder();
      const headers = { 'content-length': String(MAX_RECORDED_BODY_BYTES) };
      recorder.record(snapshot({ method: 'POST', headers, body: {} }), 200, 'observed');

      expect(recorder.get('POST', '/users/:id')).toBeDefined();
    });

    it('skips a request whose declared size is over the limit and keeps the old one', () => {
      const recorder = new RequestRecorder();
      recorder.record(snapshot({ url: '/users/42' }), 200, 'observed');
      const headers = { 'content-length': String(MAX_RECORDED_BODY_BYTES + 1) };
      recorder.record(snapshot({ url: '/users/7', headers }), 200, 'observed');

      expect(recorder.get('GET', '/users/:id')?.url).toBe('/users/42');
    });

    it('measures the body when no content-length was sent', () => {
      const recorder = new RequestRecorder();
      const body = { blob: 'x'.repeat(MAX_RECORDED_BODY_BYTES) };
      recorder.record(snapshot({ method: 'POST', headers: {}, body }), 200, 'observed');

      expect(recorder.all()).toEqual([]);
    });

    it('skips a request whose content-length is not a number', () => {
      const recorder = new RequestRecorder();
      const headers = { 'content-length': 'lots' };
      recorder.record(snapshot({ headers }), 200, 'observed');

      expect(recorder.all()).toEqual([]);
    });
  });

  describe('headers', () => {
    it('drops hop-by-hop headers and keeps the rest', () => {
      const recorder = new RequestRecorder();
      const headers = {
        host: 'localhost:3000',
        connection: 'keep-alive',
        'content-length': '0',
        'transfer-encoding': 'chunked',
        'keep-alive': 'timeout=5',
        upgrade: 'websocket',
        authorization: 'Bearer abc123xyz',
        cookie: 'sid=1',
        'x-tenant': 'acme',
      };
      recorder.record(snapshot({ headers }), 200, 'observed');

      expect(recorder.get('GET', '/users/:id')?.headers).toEqual({
        authorization: 'Bearer abc123xyz',
        cookie: 'sid=1',
        'x-tenant': 'acme',
      });
    });

    it('joins repeated header values and skips missing ones', () => {
      const recorder = new RequestRecorder();
      const headers = { accept: ['text/html', 'application/json'], 'x-empty': undefined };
      recorder.record(snapshot({ headers }), 200, 'observed');

      expect(recorder.get('GET', '/users/:id')?.headers).toEqual({
        accept: 'text/html, application/json',
      });
    });
  });

  describe('isolation', () => {
    it('is unaffected when the app mutates the body after recording', () => {
      const recorder = new RequestRecorder();
      const body = { name: 'Karim' };
      recorder.record(snapshot({ method: 'POST', headers: {}, body }), 201, 'observed');
      body.name = 'changed';

      expect(recorder.get('POST', '/users/:id')?.body).toEqual({ name: 'Karim' });
    });

    it('hands out copies so callers cannot change what is stored', () => {
      const recorder = new RequestRecorder();
      recorder.record(snapshot(), 200, 'observed');

      const copy = recorder.get('GET', '/users/:id');
      if (copy) {
        copy.headers.authorization = 'tampered';
      }
      recorder.all()[0].url = 'tampered';

      expect(recorder.get('GET', '/users/:id')).toMatchObject({
        url: '/users/42',
        headers: { authorization: 'Bearer abc123xyz' },
      });
    });

    it('skips a body it cannot copy', () => {
      const recorder = new RequestRecorder();
      recorder.record(snapshot({ headers: {}, body: { run: () => undefined } }), 200, 'observed');

      expect(recorder.all()).toEqual([]);
    });
  });

  it('keeps the unavailable-body flag', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot({ method: 'POST', bodyUnavailable: true }), 201, 'observed');

    expect(recorder.get('POST', '/users/:id')?.bodyUnavailable).toBe(true);
  });

  it('returns nothing for a route that was never recorded', () => {
    expect(new RequestRecorder().get('GET', '/nope')).toBeUndefined();
  });

  it('drops everything on clear', () => {
    const recorder = new RequestRecorder();
    recorder.record(snapshot(), 200, 'observed');
    recorder.clear();

    expect(recorder.all()).toEqual([]);
  });
});
