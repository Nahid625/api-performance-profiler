import { parseArgs } from './args';
import { ChannelClient, ChannelRefused, ChannelUnreachable, channelUrl, DEFAULT_PORT } from './client';
import { formatLoadResults, formatRoutes, formatStats } from './format';
import { ANSI, newLiveState, PLAIN, renderLive } from './live';

export interface Io {
  out(text: string): void;
  err(text: string): void;
  clear?(): void;
  isTty?: boolean;
  onInterrupt?(handler: () => void): void;
}

export const HELP = `api-profiler — see what your API routes actually do

Usage
  api-profiler                     live table, refreshed every second (Ctrl-C to stop)
  api-profiler routes              routes seen by the app and whether each has a recording
  api-profiler stats               per-route figures for the last window (observed and load)
  api-profiler load-results        results of past load runs
  api-profiler clear               forget all metrics, recordings and load results
  api-profiler run GET /users/:id  replay the recorded request under load and report

Options
  --port <n>          channel port the app opened (default ${DEFAULT_PORT})
  --json              print raw JSON instead of a table
  --once              live mode: print one frame and exit
  --fast <ms>         🟢 below this average (default 200)
  --warn <ms>         🟡 below this average, 🔴 from here (default 500)
  --connections <n>   run: concurrent connections (default 10)
  --duration <s>      run: seconds (default 5)
  --target <url>      run: override the recorded origin (localhost only)
  -h, --help          this help
  -v, --version       CLI version

The app must be running with app.use(profiler()) from @api-profiler/express.`;

const REFRESH_MS = 1000;

export async function main(argv: string[], io: Io, version: string): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv, DEFAULT_PORT);
  } catch (error) {
    io.err(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { command, positional, flags } = parsed;

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
      case 'clear': {
        await client.reset();
        io.out('Cleared.');
        return 0;
      }
      case 'run': {
        const [method, route] = positional;
        if (!method || !route) {
          io.err(`run needs a method and a route, e.g. run GET /users/:id\n\n${HELP}`);
          return 2;
        }
        const result = await client.startRun({
          method: method.toUpperCase(),
          route,
          target: flags.target,
          connections: flags.connections,
          duration: flags.duration,
        });
        if (flags.json) {
          io.out(JSON.stringify(result, null, 2));
        } else {
          io.out(formatLoadResults([result]));
          io.out(
            `Sent ${result.sent.requestsSent}, got ${result.sent.responses} responses, ` +
              `${result.sent.non2xx} non-2xx, ${result.sent.errors} errors.`,
          );
        }
        return 0;
      }
      case null:
        return live(client, io, flags);
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

async function live(
  client: ChannelClient,
  io: Io,
  flags: { once: boolean; fast: number; warn: number; json: boolean },
): Promise<number> {
  const state = newLiveState();
  const style = io.isTty ? ANSI : PLAIN;
  const thresholds = { fast: flags.fast, warn: flags.warn };
  const { version } = await client.health();

  const frame = async (): Promise<string> => {
    const [stats, loadResults] = await Promise.all([client.stats(), client.loadResults()]);
    if (flags.json) {
      return JSON.stringify({ stats, loadResults }, null, 2);
    }
    const body = renderLive(state, stats, loadResults, thresholds, Date.now(), style);
    return `api-profiler · app ${client.baseUrl} · v${version} · ${new Date().toLocaleTimeString()}\n\n${body}`;
  };

  if (flags.once || !io.isTty) {
    io.out(await frame());
    return 0;
  }

  return new Promise<number>((resolve) => {
    let stopped = false;
    const stop = (code: number) => {
      stopped = true;
      clearInterval(timer);
      resolve(code);
    };
    io.onInterrupt?.(() => stop(0));

    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const text = await frame();
        if (stopped) {
          return;
        }
        io.clear?.();
        io.out(`${text}\n\nCtrl-C to stop`);
      } catch (error) {
        if (error instanceof ChannelUnreachable || error instanceof ChannelRefused) {
          io.clear?.();
          io.err(error.message);
          stop(1);
          return;
        }
        throw error;
      }
    };
    const timer = setInterval(() => void tick(), REFRESH_MS);
    void tick();
  });
}
