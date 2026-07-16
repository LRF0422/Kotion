package com.knowledge.agent.v2.llm;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Unified LLM adapter for the V2 engine.
 *
 * <p>Provides both streaming and non-streaming inference methods.
 * Implementations may wrap existing V1 {@code LlmClient} instances or
 * connect directly to LLM providers.
 *
 * <p>The adapter is the single point of contact between the engine and
 * any LLM provider. It abstracts away:
 * <ul>
 *   <li>Provider differences (OpenAI, DeepSeek, Ollama, etc.)</li>
 *   <li>Request/response serialization</li>
 *   <li>Authentication and routing</li>
 * </ul>
 *
 * <p>Resilience (retry, timeout, circuit-breaker) is NOT part of this
 * interface — it is handled by {@link ResilientLlmAdapter} which wraps
 * any {@code LlmAdapter} implementation.
 */
public interface LlmAdapter {

    /**
     * Stream inference — returns a Flux of chunks as the LLM generates tokens.
     *
     * <p>This is the primary method for the THINK state handler. Chunks
     * contain incremental text, reasoning content, and/or tool call fragments.
     *
     * @param request the inference request
     * @return a Flux of LLM chunks, completing when the response is fully received
     */
    Flux<LlmChunk> streamInfer(InferenceRequest request);

    /**
     * Non-streaming inference — returns the complete response as a Mono.
     *
     * <p>Used for planning calls and orchestration decisions where streaming
     * is unnecessary.
     *
     * @param request the inference request
     * @return a Mono of the complete inference response
     */
    Mono<InferenceResponse> infer(InferenceRequest request);

    /**
     * Declare the capabilities of the underlying model.
     *
     * <p>Allows the engine to adapt behavior based on model features
     * (e.g., whether tool calling is supported, thinking mode, etc.).
     */
    ModelCapabilities capabilities();
}
