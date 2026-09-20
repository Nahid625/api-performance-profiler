import { Profiler } from '@api-profiler/node';
import { Connection, ConnectionState } from './connection';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function liveProfiler(): Promise<{ profiler: Profiler; port: number }> {
  const profiler = new Profiler({ channel: { port: 0 } });
  const url = await profiler.ready;
  if (!url) {
    throw new Error('channel did not start');
  }
  profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 200 });
  return { profiler, port: Number(new URL(url).port) };
}

describe('Connection', () => {
  it('reports connected with the app data', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port });
    try {
      const state = await connection.refresh();
      expect(state.kind).toBe('connected');
      if (state.kind === 'connected') {
        expect(state.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(state.stats).toEqual(profiler.stats());
        expect(state.loadResults).toEqual([]);
        expect(state.recorded).toEqual([]);
        expect(state.url).toBe(`http://127.0.0.1:${port}`);
      }
    } finally {
      await profiler.close();
    }
  });

  it('lists which routes have a recording, without the recording itself', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port });
    try {
      profiler.start()({
        method: 'POST',
        route: '/login',
        statusCode: 200,
        request: { url: '/login', origin: 'http://127.0.0.1:3000', headers: { authorization: 'Bearer secret' }, body: { password: 'hunter2' }, bodyUnavailable: false },
      });
      const state = await connection.refresh();
      expect(state.kind === 'connected' && state.recorded).toEqual(['POST /login']);
      expect(JSON.stringify(state)).not.toContain('secret');
      expect(JSON.stringify(state)).not.toContain('hunter2');
    } finally {
      await profiler.close();
    }
  });

  it('reports unreachable when the app is not running but the profiler is installed', async () => {
    const connection = new Connection({ port: 1, setup: () => Promise.resolve(null) });
    expect(await connection.refresh()).toEqual({ kind: 'unreachable', url: 'http://127.0.0.1:1' });
  });

  it('reports setup-needed with what is missing', async () => {
    const connection = new Connection({ port: 1, setup: () => Promise.resolve('package') });
    expect(await connection.refresh()).toEqual({ kind: 'setup-needed', missing: 'package' });
    const later = new Connection({ port: 1, setup: () => Promise.resolve('middleware') });
    expect(await later.refresh()).toEqual({ kind: 'setup-needed', missing: 'middleware' });
  });

  it('assumes installed when not told otherwise', async () => {
    expect((await new Connection({ port: 1 }).refresh()).kind).toBe('unreachable');
  });

  it('notifies listeners on every refresh and lets them unsubscribe', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port });
    const seen: ConnectionState['kind'][] = [];
    const off = connection.onChange((s) => seen.push(s.kind));
    try {
      await connection.refresh();
      await connection.refresh();
      off();
      await connection.refresh();
      expect(seen).toEqual(['connected', 'connected']);
    } finally {
      await profiler.close();
    }
  });

  it('polls faster while connected than while unreachable', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port, connectedIntervalMs: 20, unreachableIntervalMs: 400 });
    const seen: ConnectionState['kind'][] = [];
    connection.onChange((s) => seen.push(s.kind));
    try {
      connection.start();
      await wait(320);
      const connected = seen.filter((k) => k === 'connected').length;
      expect(connected).toBeGreaterThanOrEqual(3);

      await profiler.close();
      await wait(120);
      const before = seen.length;
      await wait(250);
      // After going unreachable the 400ms cadence yields at most one more poll here.
      expect(seen.length - before).toBeLessThanOrEqual(1);
      expect(seen[seen.length - 1]).toBe('unreachable');
    } finally {
      connection.stop();
      await profiler.close();
    }
  });

  it('stops polling on stop and while paused, discarding a poll in flight', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port, connectedIntervalMs: 5 });
    let polls = 0;
    connection.onChange(() => polls++);
    try {
      connection.start();
      await wait(100);
      expect(polls).toBeGreaterThan(1);

      // With a 5ms cadence a poll is almost always in flight when we pause.
      connection.pause();
      const paused = polls;
      await wait(100);
      expect(polls).toBe(paused);

      connection.resume();
      await wait(100);
      expect(polls).toBeGreaterThan(paused);

      connection.stop();
      const stopped = polls;
      await wait(100);
      expect(polls).toBe(stopped);
    } finally {
      connection.stop();
      await profiler.close();
    }
  });

  it('does not poll when started while paused, until resumed', async () => {
    const { profiler, port } = await liveProfiler();
    const connection = new Connection({ port, connectedIntervalMs: 30 });
    let polls = 0;
    connection.onChange(() => polls++);
    try {
      connection.pause();
      connection.start();
      await wait(100);
      expect(polls).toBe(0);

      connection.resume();
      await wait(100);
      expect(polls).toBeGreaterThan(0);
    } finally {
      connection.stop();
      await profiler.close();
    }
  });

  it('exposes the last state synchronously', async () => {
    const connection = new Connection({ port: 1 });
    expect(connection.state.kind).toBe('unreachable');
    expect(connection.url).toBe('http://127.0.0.1:1');
  });
});
