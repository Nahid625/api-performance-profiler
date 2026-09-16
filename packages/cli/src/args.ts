export interface Flags {
  port: number;
  json: boolean;
  help: boolean;
  version: boolean;
  target?: string;
  connections?: number;
  duration?: number;
}

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Flags;
}

const NUMERIC = new Set(['port', 'connections', 'duration']);
const BOOLEAN = new Set(['json', 'help', 'version']);
const STRING = new Set(['target']);

export function parseArgs(argv: string[], defaultPort: number): ParsedArgs {
  const flags: Flags = { port: defaultPort, json: false, help: false, version: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '-v') {
      flags.version = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (BOOLEAN.has(name)) {
      flags[name as 'json' | 'help' | 'version'] = true;
      continue;
    }
    if (!NUMERIC.has(name) && !STRING.has(name)) {
      throw new Error(`unknown option --${name}`);
    }
    const raw = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (raw === undefined) {
      throw new Error(`--${name} needs a value`);
    }
    if (NUMERIC.has(name)) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`--${name} must be a positive number, got ${JSON.stringify(raw)}`);
      }
      flags[name as 'port' | 'connections' | 'duration'] = value;
      continue;
    }
    flags.target = raw;
  }

  const [command = null, ...rest] = positional;
  return { command, positional: rest, flags };
}
