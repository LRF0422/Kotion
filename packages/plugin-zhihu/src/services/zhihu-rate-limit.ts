/**
 * Serializes requests with a minimum spacing so a burst of tool calls does not
 * trip the platform's rate limit (error code 30001).
 */
export class ZhihuRateLimitQueue {
    private chain: Promise<unknown> = Promise.resolve();
    private lastRunAt = 0;
    private minIntervalMs: number;

    constructor(minIntervalMs = 350) {
        this.minIntervalMs = minIntervalMs;
    }

    run<T>(task: () => Promise<T>): Promise<T> {
        const result = this.chain.then(async () => {
            const wait = this.minIntervalMs - (Date.now() - this.lastRunAt);
            if (wait > 0) {
                await new Promise((resolve) => setTimeout(resolve, wait));
            }
            try {
                return await task();
            } finally {
                this.lastRunAt = Date.now();
            }
        });
        // Keep the chain alive even when a task rejects.
        this.chain = result.then(
            () => undefined,
            () => undefined,
        );
        return result as Promise<T>;
    }
}

export const zhihuRateLimit = new ZhihuRateLimitQueue();
