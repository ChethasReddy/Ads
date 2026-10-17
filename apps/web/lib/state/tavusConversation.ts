/** One instance per ad. Pending replies and timers cannot outlive that ad. */
export class TavusConversation {
  ended = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private liveAt: number | undefined;
  private shortSeconds = 30;
  private engaged = false;
  private revision = 0;

  constructor(
    private readonly close: () => void,
    private readonly silence: () => unknown,
  ) {}

  private deadline(at: number): void {
    clearTimeout(this.timer);
    if (!this.ended) this.timer = setTimeout(() => this.stop(), Math.max(0, at - Date.now()));
  }

  start(shortSeconds: number): void {
    this.shortSeconds = shortSeconds;
    this.deadline(Date.now() + (shortSeconds + 25) * 1000);
  }

  live(): void {
    if (this.ended || this.liveAt !== undefined) return;
    this.liveAt = Date.now();
    this.deadline(this.liveAt + (this.engaged ? 90 : this.shortSeconds + 8) * 1000);
  }

  engage(source: "button" | "speech" | "question" | "perception"): void {
    if (this.ended || source === "perception") return;
    this.engaged = true;
    if (this.liveAt !== undefined) this.deadline(this.liveAt + 90_000);
  }

  shorten(): void {
    this.engaged = false;
    this.deadline(Math.min(Date.now() + 8_000, (this.liveAt ?? Date.now()) + 90_000));
  }

  request(): number { return ++this.revision; }
  accept(revision: number): boolean { return !this.ended && revision === this.revision; }

  stop(): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    // No promise is awaited here: even failed network cleanup cannot delay exit.
    try { this.silence(); } finally { this.close(); }
  }

  dispose(): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.silence();
  }
}
