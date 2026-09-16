import { MASK, maskRecording } from './mask';
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
    recordedAt: 1757745600000,
    ...overrides,
  };
}

function headersOf(headers: Record<string, string>): Record<string, string> {
  return maskRecording(recording({ headers })).headers;
}

describe('maskRecording', () => {
  describe('authorization', () => {
    it.each([
      ['Bearer abc123xyz', `Bearer ${MASK}`],
      ['Basic dXNlcjpwYXNz', `Basic ${MASK}`],
      ['abc123xyz', MASK],
      ['livesecret abc123', MASK],
      ['AWS4-HMAC-SHA256 Credential=AKIA/2026', MASK],
    ])('masks %s', (value, expected) => {
      expect(headersOf({ authorization: value }).authorization).toBe(expected);
    });

    it('masks proxy-authorization the same way', () => {
      expect(headersOf({ 'proxy-authorization': 'Basic zzz' })['proxy-authorization']).toBe(
        `Basic ${MASK}`,
      );
    });

    it('does not reveal how long the secret was', () => {
      const short = headersOf({ authorization: 'Bearer a' }).authorization;
      const long = headersOf({ authorization: `Bearer ${'a'.repeat(500)}` }).authorization;
      expect(short).toBe(long);
    });
  });

  describe('cookie', () => {
    it('keeps cookie names and hides every value', () => {
      expect(headersOf({ cookie: 'sid=9f8e7; theme=dark' }).cookie).toBe(
        `sid=${MASK}; theme=${MASK}`,
      );
    });

    it('masks a cookie fragment that has no name', () => {
      expect(headersOf({ cookie: 'orphanvalue' }).cookie).toBe(MASK);
    });
  });

  describe('other headers', () => {
    it.each([
      'x-api-key',
      'x-auth-token',
      'x-shopify-access-token',
      'x-session-id',
      'x-client-secret',
      'x-user-password',
      'x-amz-signature',
      'x-credentials',
    ])('masks %s by name', (name) => {
      expect(headersOf({ [name]: 'sensitive-value' })[name]).toBe(MASK);
    });

    it.each(['content-type', 'accept', 'user-agent', 'x-tenant', 'x-request-id'])(
      'leaves %s readable',
      (name) => {
        expect(headersOf({ [name]: 'plain-value' })[name]).toBe('plain-value');
      },
    );

    it('matches header names regardless of case', () => {
      expect(headersOf({ 'X-API-KEY': 'sk_live_4242' })['X-API-KEY']).toBe(MASK);
    });
  });

  describe('url', () => {
    function urlOf(url: string, route = '/orders'): string {
      return maskRecording(recording({ url, route })).url;
    }

    it('hides sensitive query values and keeps the rest', () => {
      expect(urlOf('/orders?token=abc&page=2')).toBe(`/orders?token=${MASK}&page=2`);
    });

    it('recognises a query key whose sensitive word is percent-encoded', () => {
      expect(urlOf('/orders?%74oken=abc')).toBe(`/orders?%74oken=${MASK}`);
    });

    it('leaves a query flag without a value alone', () => {
      expect(urlOf('/orders?debug&page=2')).toBe('/orders?debug&page=2');
    });

    it('leaves a url without a query alone', () => {
      expect(urlOf('/orders')).toBe('/orders');
    });

    it('does not break on a malformed encoding', () => {
      expect(urlOf('/orders?%E0%A4%A=1')).toBe('/orders?%E0%A4%A=1');
    });

    it('hides a path param whose name is sensitive', () => {
      expect(urlOf('/reset-password/abc123', '/reset-password/:token')).toBe(
        `/reset-password/${MASK}`,
      );
    });

    it('keeps an ordinary path param', () => {
      expect(urlOf('/users/42', '/users/:id')).toBe('/users/42');
    });

    it('masks path and query together', () => {
      expect(urlOf('/invite/xyz?key=k1&ref=mail', '/invite/:token')).toBe(
        `/invite/${MASK}?key=${MASK}&ref=mail`,
      );
    });
  });

  describe('body', () => {
    it('reports no body', () => {
      expect(maskRecording(recording()).body).toEqual({ kind: 'none' });
    });

    it('reports a body that was sent but not parsed', () => {
      expect(maskRecording(recording({ bodyUnavailable: true })).body).toEqual({
        kind: 'unavailable',
      });
    });

    it('summarises a JSON body by type and size only', () => {
      const summary = maskRecording(
        recording({
          headers: { 'content-type': 'application/json' },
          body: { email: 'karim@example.com', password: 'hunter2' },
        }),
      ).body;

      expect(summary).toEqual({
        kind: 'captured',
        contentType: 'application/json',
        bytes: Buffer.byteLength('{"email":"karim@example.com","password":"hunter2"}'),
      });
    });

    it('measures text and binary bodies by their bytes', () => {
      expect(maskRecording(recording({ body: 'héllo' })).body).toMatchObject({ bytes: 6 });
      expect(maskRecording(recording({ body: new Uint8Array(10) })).body).toMatchObject({
        bytes: 10,
      });
    });

    it('reports an unknown content type as null', () => {
      expect(maskRecording(recording({ body: { a: 1 } })).body).toMatchObject({
        contentType: null,
      });
    });
  });

  it('never lets a secret through anywhere in the output', () => {
    const secrets = ['abc123xyz', '9f8e7', 'sk_live_4242', 'qtok', 'resetcode', 'hunter2'];
    const masked = maskRecording(
      recording({
        method: 'POST',
        route: '/reset/:token',
        url: '/reset/resetcode?api_key=qtok',
        headers: {
          authorization: 'Bearer abc123xyz',
          cookie: 'sid=9f8e7',
          'x-api-key': 'sk_live_4242',
          'content-type': 'application/json',
        },
        body: { password: 'hunter2' },
      }),
    );

    const output = JSON.stringify(masked);
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
  });

  it('leaves the stored recording untouched for replay', () => {
    const original = recording({
      url: '/orders?token=abc',
      route: '/orders',
      headers: { authorization: 'Bearer abc123xyz' },
      body: { password: 'hunter2' },
    });
    maskRecording(original);

    expect(original.url).toBe('/orders?token=abc');
    expect(original.headers.authorization).toBe('Bearer abc123xyz');
    expect(original.body).toEqual({ password: 'hunter2' });
  });

  it('keeps method, route and time as they are', () => {
    expect(maskRecording(recording({ method: 'DELETE' }))).toMatchObject({
      method: 'DELETE',
      route: '/users/:id',
      recordedAt: 1757745600000,
    });
  });
});
