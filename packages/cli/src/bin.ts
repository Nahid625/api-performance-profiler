#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main';

const version: string = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;

main(
  process.argv.slice(2),
  { out: (t) => process.stdout.write(`${t}\n`), err: (t) => process.stderr.write(`${t}\n`) },
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
