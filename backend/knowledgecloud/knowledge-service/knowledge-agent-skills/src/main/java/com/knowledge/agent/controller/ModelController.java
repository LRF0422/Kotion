package com.knowledge.agent.controller;

import com.knowledge.agent.llm.LlmClientFactory;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Model discovery endpoints (provider/model metadata).
 *
 * <p>
 * Extracted from the removed v1 {@code ChatController} — the chat
 * execution path now lives exclusively in
 * {@link com.knowledge.agent.v2.controller.AgentV2Controller}, but the
 * frontend still discovers models/providers through these v1-prefixed
 * read-only endpoints.
 */
@Api(tags = "Model Discovery")
@Slf4j
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ModelController {

    private final LlmClientFactory llmClientFactory;

    /**
     * Models list endpoint — for ai-sdk provider discovery.
     */
    @ApiOperation("List available models")
    @GetMapping("/models")
    public ResponseEntity<Map<String, Object>> listModels() {
        List<Map<String, Object>> data = new ArrayList<>();
        Map<String, List<String>> allModels = llmClientFactory.getAllModels();
        for (Map.Entry<String, List<String>> entry : allModels.entrySet()) {
            String provider = entry.getKey();
            for (String model : entry.getValue()) {
                Map<String, Object> modelInfo = new LinkedHashMap<>();
                modelInfo.put("id", model);
                modelInfo.put("object", "model");
                modelInfo.put("owned_by", provider);
                modelInfo.put("provider", provider);
                data.add(modelInfo);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("object", "list");
        body.put("data", data);

        return ResponseEntity.ok(body);
    }

    /**
     * List available providers.
     */
    @ApiOperation("List available model providers")
    @GetMapping("/providers")
    public ResponseEntity<Map<String, Object>> listProviders() {
        List<String> providers = llmClientFactory.getAvailableProviders();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("object", "list");
        body.put("data", providers);
        return ResponseEntity.ok(body);
    }

    /**
     * Get provider capabilities and configuration.
     */
    @ApiOperation("Get provider capabilities")
    @GetMapping("/chat/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        Map<String, Object> config = new LinkedHashMap<>();

        Map<String, Object> features = new LinkedHashMap<>();
        features.put("streaming", true);
        features.put("toolStreaming", true);
        features.put("multiStep", true);
        features.put("multiAgent", true);
        config.put("features", features);

        config.put("models", llmClientFactory.getAllModels());
        config.put("providers", llmClientFactory.getAvailableProviders());

        List<String> protocols = new ArrayList<>();
        protocols.add("sse");
        protocols.add("data");
        config.put("streamProtocols", protocols);

        return ResponseEntity.ok(config);
    }
}
