package com.knowledge.agent.llm;

import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Unified LLM client interface.
 * Supports both synchronous and streaming chat completions.
 */
public interface LlmClient {

    /**
     * Synchronous chat completion.
     *
     * @param request the chat request
     * @return the chat response
     */
    LlmResponse chat(LlmRequest request);

    /**
     * Streaming chat completion.
     *
     * @param request the chat request
     * @return a Flux of streaming chunks
     */
    Flux<StreamChunk> streamChat(LlmRequest request);

    /**
     * Returns the provider name (e.g., "deepseek", "openai", "ollama").
     */
    String getProviderName();

    /**
     * Returns the default model name for this client.
     */
    String getDefaultModel();

    /**
     * Returns all models supported by this client.
     */
    List<String> getAvailableModels();
}
