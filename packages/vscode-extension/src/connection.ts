import type { RouteStats } from '@api-profiler/core';
import type { LoadResult } from '@api-profiler/node';
import { ChannelClient, ChannelUnreachable, channelUrl } from 'api-profiler';

export type ConnectionState =
  | { kind: 'setup-needed' }
  | { kind: 'unreachable'; url: string }
  | { kind: 'connected'; url: string; version: string; stats: RouteStats[]; loadResults: LoadResult[] };

export interface ConnectionOptions {
  port: number;
  connectedIntervalMs?: number;
  unreachableIntervalMs?: number;
  // Whether the workspace has the profiler installed; decides setup-needed vs unreachable.
  isInstalled?: () => Promise<boolean>;
}

export type Listener = (state: ConnectionState) => void;

export class Connection {
  private readonly client: ChannelClient;
  private readonly connectedInterval: number;
  private readonly unreachableInterval: number;
  private readonly isInstalled: () => Promise<boolean>;
  private readonly listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private paused = false;
  private current: ConnectionState;

  constructor(options: ConnectionOptions) {
    this.client = new ChannelClient(channelUrl(options.port));
    this.connectedInterval = options.connectedIntervalMs ?? 1000;
    this.unreachableInterval = options.unreachableIntervalMs ?? 5000;
    this.isInstalled = options.isInstalled ?? (() => Promise.resolve(true));
    this.current = { kind: 'unreachable', url: this.client.baseUrl };
  }

  get state(): ConnectionState {
    return this.current;
  }

  get url(): string {
    return this.client.baseUrl;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  // Polling is pointless while the window is hidden; resume snaps straight back.
  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    if (this.running) {
      void this.tick();
    }
  }

  async refresh(): Promise<ConnectionState> {
    return this.apply(await this.fetchState());
  }

  private async fetchState(): Promise<ConnectionState> {
    try {
      const [health, stats, loadResults] = await Promise.all([
        this.client.health(),
        this.client.stats(),
        this.client.loadResults(),
      ]);
      return { kind: 'connected', url: this.client.baseUrl, version: health.version, stats, loadResults };
    } catch (error) {
      if (!(error instanceof ChannelUnreachable)) {
        throw error;
      }
      return (await this.isInstalled())
        ? { kind: 'unreachable', url: this.client.baseUrl }
        : { kind: 'setup-needed' };
    }
  }

  private apply(next: ConnectionState): ConnectionState {
    this.current = next;
    for (const listener of this.listeners) {
      listener(next);
    }
    return next;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.paused) {
      return;
    }
    let next: ConnectionState | null = null;
    try {
      next = await this.fetchState();
    } catch {
      // A malformed answer is treated like a missed poll; the next one will retry.
    }
    // A poll that was in flight when pause() or stop() was called is discarded.
    if (!this.running || this.paused) {
      return;
    }
    if (next) {
      this.apply(next);
    }
    const delay = this.current.kind === 'connected' ? this.connectedInterval : this.unreachableInterval;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
