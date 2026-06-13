package com.knowledge.agent.llm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.concurrent.TimeoutException;
import java.time.Duration;

/**
 * Resilience decorator for LLM streaming calls (P4).
 *
 * <p>Implemented with native Reactor operators only — no new dependency
 * (Resilience4j was an option but the project keeps deps minimal). Applies:
 * <ul>
 *   <li><b>idle / first-token timeout</b>: {@code timeout(idle)} fires if no
 *       chunk (including the first) arrives within the window, surfacing a clean
 *       {@link TimeoutException} the harness maps to a recoverable error;</li>
 *   <li><b>hook for retry</b>: streaming auto-retry is intentionally NOT enabled
 *       here — retrying a partially-consumed stream would duplicate already-sent
 *       tokens. Retry belongs before the first token only; that refinement is a
 *       follow-up. The seam is centralised here so it lands in one place.</li>
 * </ul>
 */
@Slf4j
@Component
public class LlmResilience {

    /** Max gap between streamed chunks (and before the first) before timing out. */
    @Value("${agent.llm.idle-timeout-seconds:120}")
    private int idleTimeoutSeconds;

    /**
     * Wrap an LLM chunk stream with the configured resilience operators.
     */
    public Flux<StreamChunk> apply(Flux<StreamChunk> source) {
        return source
                .timeout(Duration.ofSeconds(idleTimeoutSeconds))
                .onErrorMap(TimeoutException.class, e ->
                        new RuntimeException("LLM stream idle timeout after " + idleTimeoutSeconds + "s", e));
    }
}
