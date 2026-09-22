import { ZhihuTimeoutError } from "./zhihu-errors";

export interface ZhihuRateLimitOptions {
    /**
     * Absolute deadline (Date.now() based). A queued task that cannot start
     * before it fails immediately instead of waiting behind the serial queue.
     */
    deadline?: number;
    /** Total per-call budget, used only to describe the timeout. */
    timeoutMs?: number;
}

/**
 * Serializes requests with a minimum spacing so a burst of tool calls does not
 * trip the platform's rate limit (error code 30001).
 *
 * Bursts are also bounded: once a queued call's deadline has passed it fails
 * with a {@link ZhihuTimeoutError} (no retry) instead of piling up indefinitely.
 */
export class ZhihuRateLimitQueue {
    private chain: Promise<unknown> = Promise.resolve();
    private lastRunAt = 0;
    private minIntervalMs: number;

    constructor(minIntervalMs = 350) {
        this.minIntervalMs = minIntervalMs;
    }

    run<T>(task: () => Promise<T>, options: ZhihuRateLimitOptions = {}): Promise<T> {
        const { deadline, timeoutMs = 0 } = options;
        const result = this.chain.then(async () => {
            const wait = this.minIntervalMs - (Date.now() - this.lastRunAt);
            if (wait > 0) {
                if (deadline !== undefined && Date.now() + wait >= deadline) {
                    throw new ZhihuTimeoutError(timeoutMs);
                }
                await new Promise((resolve) => setTimeout(resolve, wait));
            }
            if (deadline !== undefined && Date.now() >= deadline) {
                throw new ZhihuTimeoutError(timeoutMs);
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
