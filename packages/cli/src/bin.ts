#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main';

const version: string = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;
const ESC = String.fromCharCode(27);

main(
  process.argv.slice(2),
  {
    out: (t) => process.stdout.write(`${t}\n`),
    err: (t) => process.stderr.write(`${t}\n`),
    clear: () => process.stdout.write(`${ESC}[2J${ESC}[H`),
    isTty: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
    onInterrupt: (handler) => {
      process.once('SIGINT', handler);
      process.once('SIGTERM', handler);
    },
  },
  version,
).then(
  (code) => {
    process.exitCode = code;
  },
  (error: Error) => {
    process.stderr.write(`api-profiler: ${error.message}\n`);
    process.exitCode = 1;
  },
);
