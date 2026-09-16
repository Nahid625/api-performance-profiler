import { parseArgs } from './args';
import { ChannelClient, ChannelRefused, ChannelUnreachable, channelUrl, DEFAULT_PORT } from './client';
import { formatLoadResults, formatRoutes, formatStats } from './format';

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

export const HELP = `api-profiler — see what your API routes actually do

Usage
  api-profiler routes            routes seen by the app and whether each has a recording
  api-profiler stats             per-route figures for the last window (observed and load)
  api-profiler load-results      results of past load runs

Options
  --port <n>     channel port the app opened (default ${DEFAULT_PORT})
  --json         print raw JSON instead of a table
  -h, --help     this help
  -v, --version  CLI version

The app must be running with app.use(profiler()) from @api-profiler/express.`;

export async function main(argv: string[], io: Io, version: string): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv, DEFAULT_PORT);
  } catch (error) {
    io.err(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { command, flags } = parsed;

  if (flags.version) {
    io.out(version);
    return 0;
  }
  if (flags.help || command === 'help') {
    io.out(HELP);
    return 0;
  }

  const client = new ChannelClient(channelUrl(flags.port));
  try {
    switch (command) {
      case 'routes': {
        const [recordings, stats] = await Promise.all([client.recordings(), client.stats()]);
        io.out(flags.json ? JSON.stringify({ recordings, stats }, null, 2) : formatRoutes(recordings, stats));
        return 0;
      }
      case 'stats': {
        const stats = await client.stats();
        io.out(flags.json ? JSON.stringify(stats, null, 2) : formatStats(stats));
        return 0;
      }
      case 'load-results': {
        const results = await client.loadResults();
        io.out(flags.json ? JSON.stringify(results, null, 2) : formatLoadResults(results));
        return 0;
      }
      case null:
        io.err(`missing command\n\n${HELP}`);
        return 2;
      default:
        io.err(`unknown command "${command}"\n\n${HELP}`);
        return 2;
    }
  } catch (error) {
    if (error instanceof ChannelUnreachable || error instanceof ChannelRefused) {
      io.err(error.message);
      return 1;
    }
    throw error;
  }
}
