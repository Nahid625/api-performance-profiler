import { applyInsertion, planInsertion } from './onboarding';

describe('planInsertion', () => {
  it('adds a require and app.use after the app is created (CommonJS)', () => {
    const text = ["const express = require('express');", "const cors = require('cors');", '', 'const app = express();', "app.use(cors());"].join('\n');
    const plan = planInsertion('app.js', text);
    expect(plan).toEqual({
      importAt: 2,
      importLine: "const { profiler } = require('@api-profiler/express');",
      useAt: 4,
      useLine: 'app.use(profiler());',
    });
    expect(applyInsertion(text, plan!)).toBe(
      [
        "const express = require('express');",
        "const cors = require('cors');",
        "const { profiler } = require('@api-profiler/express');",
        '',
        'const app = express();',
        'app.use(profiler());',
        "app.use(cors());",
      ].join('\n'),
    );
  });

  it('uses an import when the file uses imports, and keeps indentation', () => {
    const text = ["import express from 'express';", '', 'export function createApp() {', '  const server = express();', '  return server;', '}'].join('\n');
    const plan = planInsertion('app.ts', text);
    expect(plan).toEqual({
      importAt: 1,
      importLine: "import { profiler } from '@api-profiler/express';",
      useAt: 4,
      useLine: '  server.use(profiler());',
    });
  });

  it('recognises a NestJS bootstrap and keeps the import after the last import', () => {
    const text = [
      "import { NestFactory } from '@nestjs/core';",
      "import { AppModule } from './app.module';",
      '',
      'async function bootstrap() {',
      '  const app = await NestFactory.create<NestExpressApplication>(AppModule, {',
      '    rawBody: true,',
      '  });',
      "  app.setGlobalPrefix('api');",
      '  await app.listen(3000);',
      '}',
    ].join('\n');
    expect(planInsertion('main.ts', text)).toEqual({
      importAt: 2,
      importLine: "import { profiler } from '@api-profiler/express';",
      useAt: 7,
      useLine: '  app.use(profiler());',
    });
  });

  it('handles a destructured or property require', () => {
    const text = ["const { json } = require('express');", "const express = require('express').default;", 'const app = express();'].join('\n');
    expect(planInsertion('app.js', text)).toMatchObject({ importAt: 2, useAt: 3 });
  });

  it('puts the require at the top when there are no imports', () => {
    const text = ['const app = express();'].join('\n');
    expect(planInsertion('app.js', text)).toMatchObject({ importAt: 0, useAt: 1 });
  });

  it('returns null when there is no express() call or the profiler is already there', () => {
    expect(planInsertion('a.js', "const app = require('fastify')();")).toBeNull();
    expect(planInsertion('a.js', 'const app = express(options);')).toBeNull();
    expect(planInsertion('a.js', ["const { profiler } = require('@api-profiler/express');", 'const app = express();'].join('\n'))).toBeNull();
  });

  it('uses a multi-line statement end for the insertion point', () => {
    const text = ['const app = express(', ');', 'app.listen(3000);'].join('\n');
    expect(planInsertion('a.js', text)).toMatchObject({ useAt: 2 });
  });
});
