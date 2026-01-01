export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number,
    private name: string = 'RateLimiter'
  ) {}

  async throttle(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const wait = Math.ceil((this.windowMs - (now - this.timestamps[0])) / 1000);
      throw new Error(`Rate limit exceeded for ${this.name}. Wait ${wait}s.`);
    }

    this.timestamps.push(now);
  }
}
