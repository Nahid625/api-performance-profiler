import { discoverRoutes, matchRoute, RouteLocation } from './discover';

function found(locations: RouteLocation[]): string[] {
  return locations
    .map((l) => `${l.method} ${l.route} @ ${l.file}:${l.line}${l.prefixKnown ? '' : ' (prefix unknown)'}`)
    .sort();
}

describe('discoverRoutes — Express', () => {
  it('finds routes on the app with their line numbers', () => {
    const text = [
      "const express = require('express');",
      'const app = express();',
      "app.get('/users/:id', (req, res) => res.json({}));",
      "app.post('/login', login);",
      "app.delete('/users/:id', remove);",
      '',
      "app.all('/health', ok);",
    ].join('\n');
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual([
      'ALL /health @ app.js:7',
      'DELETE /users/:id @ app.js:5',
      'GET /users/:id @ app.js:3',
      'POST /login @ app.js:4',
    ]);
  });

  it('applies the mount prefix of a router in the same file', () => {
    const text = [
      'const api = express.Router();',
      "api.get('/orders', list);",
      "api.get('/orders/:id', one);",
      "app.use('/api', api);",
    ].join('\n');
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual([
      'GET /api/orders @ app.js:2',
      'GET /api/orders/:id @ app.js:3',
    ]);
  });

  it('follows a router imported from another file (require and import)', () => {
    const app = [
      "const users = require('./routes/users');",
      "import orders from './routes/orders.js';",
      "app.use('/users', users);",
      "app.use('/orders', orders);",
    ].join('\n');
    const users = ["const router = express.Router();", "router.get('/:id', one);", 'module.exports = router;'].join('\n');
    const orders = ['const r = Router();', "r.post('/', create);", 'export default r;'].join('\n');
    const result = discoverRoutes([
      { path: 'src/app.js', text: app },
      { path: 'src/routes/users.js', text: users },
      { path: 'src/routes/orders.js', text: orders },
    ]);
    expect(found(result)).toEqual(['GET /users/:id @ src/routes/users.js:2', 'POST /orders @ src/routes/orders.js:2']);
  });

  it('composes nested mounts across files', () => {
    const app = ["const api = require('./api');", "app.use('/api', api);"].join('\n');
    const api = ["const v1 = require('./v1');", 'const api = express.Router();', "api.use('/v1', v1);", 'module.exports = api;'].join('\n');
    const v1 = ['const v1 = express.Router();', "v1.get('/items', list);", 'module.exports = v1;'].join('\n');
    const result = discoverRoutes([
      { path: 'app.js', text: app },
      { path: 'api.js', text: api },
      { path: 'v1.js', text: v1 },
    ]);
    expect(found(result)).toEqual(['GET /api/v1/items @ v1.js:2']);
  });

  it('supports require with an index file and router.route chains', () => {
    const app = ["const shop = require('./shop');", "app.use('/shop', shop);"].join('\n');
    const shop = ['const r = express.Router();', "r.route('/cart').get(show).post(add);", 'module.exports = r;'].join('\n');
    const result = discoverRoutes([
      { path: 'app.js', text: app },
      { path: 'shop/index.js', text: shop },
    ]);
    expect(found(result)).toEqual(['GET /shop/cart @ shop/index.js:2', 'POST /shop/cart @ shop/index.js:2']);
  });

  it('follows a route chain of any length', () => {
    const text = "app.route('/item').get(a).post(b).put(c).delete(d);";
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual([
      'DELETE /item @ app.js:1',
      'GET /item @ app.js:1',
      'POST /item @ app.js:1',
      'PUT /item @ app.js:1',
    ]);
  });

  it('propagates an unknown outer prefix to nested routers', () => {
    const text = [
      'const v1 = express.Router();',
      "v1.get('/items', list);",
      'const api = express.Router();',
      "api.use('/v1', v1);",
      'app.use(base, api);',
    ].join('\n');
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual(['GET /items @ app.js:2 (prefix unknown)']);
  });

  it('marks the prefix unknown when it is not a literal, but keeps the tail', () => {
    const text = ['const r = express.Router();', "r.get('/things', list);", 'app.use(prefixFromConfig, r);'].join('\n');
    const result = discoverRoutes([{ path: 'app.js', text }]);
    expect(found(result)).toEqual(['GET /things @ app.js:2 (prefix unknown)']);
  });

  it('marks the prefix unknown when the router comes from a file it cannot see', () => {
    const app = ["const r = require('./missing');", "app.use('/x', r);"].join('\n');
    const other = ['const r = express.Router();', "r.get('/y', h);", 'module.exports = r;'].join('\n');
    const result = discoverRoutes([
      { path: 'app.js', text: app },
      { path: 'unrelated.js', text: other },
    ]);
    expect(found(result)).toEqual(['GET /y @ unrelated.js:2']);
  });

  it('ignores paths that are not literals and calls without handlers', () => {
    const text = [
      'app.get(/^\\/re/, h);',
      "app.get(`/tpl/${id}`, h);",
      "app.get('/no-handler');",
      "app.get('/ok', h);",
    ].join('\n');
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual(['GET /ok @ app.js:4']);
  });

  it('normalises slashes and strips param patterns', () => {
    const text = ['const r = express.Router();', "r.get('/items/:id(\\\\d+)/', h);", "app.use('/api/', r);"].join('\n');
    expect(found(discoverRoutes([{ path: 'app.js', text }]))).toEqual(['GET /api/items/:id @ app.js:2']);
  });

  it('works on TypeScript sources too', () => {
    const text = ["import express from 'express';", 'const app = express();', "app.get('/ts', (req: Request, res: Response) => res.send(1));"].join('\n');
    expect(found(discoverRoutes([{ path: 'server.ts', text }]))).toEqual(['GET /ts @ server.ts:3']);
  });
});

describe('discoverRoutes — NestJS', () => {
  it('joins the controller prefix and method paths', () => {
    const text = [
      "import { Controller, Get, Post } from '@nestjs/common';",
      "@Controller('users')",
      'export class UsersController {',
      '  @Get()',
      '  list() {}',
      '',
      "  @Get(':id')",
      '  one() {}',
      '',
      "  @Post('bulk')",
      '  bulk() {}',
      '}',
    ].join('\n');
    expect(found(discoverRoutes([{ path: 'users.controller.ts', text }]))).toEqual([
      'GET /users @ users.controller.ts:4',
      'GET /users/:id @ users.controller.ts:7',
      'POST /users/bulk @ users.controller.ts:10',
    ]);
  });

  it('applies a global prefix found in main.ts', () => {
    const main = ["const app = await NestFactory.create(AppModule);", "app.setGlobalPrefix('api');"].join('\n');
    const ctrl = ["@Controller('cats')", 'class Cats {', "  @Get(':id') one() {}", '}'].join('\n');
    const result = discoverRoutes([
      { path: 'main.ts', text: main },
      { path: 'cats.controller.ts', text: ctrl },
    ]);
    expect(found(result)).toEqual(['GET /api/cats/:id @ cats.controller.ts:3']);
  });

  it('ignores classes without @Controller', () => {
    const text = ['class Plain {', "  @Get('x') one() {}", '}'].join('\n');
    expect(discoverRoutes([{ path: 'a.ts', text }])).toEqual([]);
  });
});

describe('matchRoute', () => {
  const locations: RouteLocation[] = [
    { method: 'GET', route: '/api/orders/:id', file: 'a.js', line: 1, prefixKnown: true },
    { method: 'GET', route: '/things', file: 'b.js', line: 2, prefixKnown: false },
    { method: 'ALL', route: '/health', file: 'c.js', line: 3, prefixKnown: true },
  ];

  it('prefers an exact match with a known prefix', () => {
    expect(matchRoute(locations, 'get', '/api/orders/:id')?.file).toBe('a.js');
  });

  it('falls back to a tail match when the prefix was unknown', () => {
    expect(matchRoute(locations, 'GET', '/v2/things')?.file).toBe('b.js');
    expect(matchRoute(locations, 'GET', '/things')?.file).toBe('b.js');
  });

  it('lets ALL match any method and respects the method otherwise', () => {
    expect(matchRoute(locations, 'POST', '/health')?.file).toBe('c.js');
    expect(matchRoute(locations, 'POST', '/api/orders/:id')).toBeUndefined();
  });
});
