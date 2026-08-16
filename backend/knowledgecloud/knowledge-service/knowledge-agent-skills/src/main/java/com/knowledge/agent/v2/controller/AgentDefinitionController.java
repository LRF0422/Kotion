package com.knowledge.agent.v2.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.AgentDefinitionService;
import com.knowledge.agent.store.entity.AgentDefinitionEntity;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * CRUD endpoints for custom agent definitions.
 *
 * <p>
 * Definitions are tenant/user scoped and consumed by:
 * <ul>
 * <li>the chat entry point ({@code ChatCompletionRequest.agentId})</li>
 * <li>the delegation tool ({@code delegate_task(agent_name)})</li>
 * </ul>
 */
@Api(tags = "Agent V2 Definitions")
@Slf4j
@RestController
@RequestMapping("/api/v2/agent/definitions")
@RequiredArgsConstructor
public class AgentDefinitionController {

    private final AgentDefinitionService definitionService;
    private final ToolRegistry toolRegistry;
    private final ObjectMapper objectMapper;

    @ApiOperation("List backend tools available for the definition tool selection")
    @GetMapping("/tools")
    public R<List<ToolView>> tools() {
        return R.data(toolRegistry.getAll().stream()
                .filter(t -> !t.isFrontend())
                .map(t -> {
                    ToolView view = new ToolView();
                    view.setId(t.getId());
                    view.setDescription(t.getDescription());
                    return view;
                })
                .sorted(Comparator.comparing(ToolView::getId))
                .collect(Collectors.toList()));
    }

    @ApiOperation("List custom agent definitions for the current tenant")
    @GetMapping
    public R<List<AgentDefinitionView>> list() {
        Long tenantId = currentTenantId();
        return R.data(definitionService.list(tenantId).stream()
                .map(this::toView)
                .collect(Collectors.toList()));
    }

    @ApiOperation("Get a custom agent definition")
    @GetMapping("/{id}")
    public R<AgentDefinitionView> get(@PathVariable Long id) {
        AgentDefinitionEntity entity = definitionService.get(id, currentTenantId());
        if (entity == null) {
            return R.fail("Agent definition not found: " + id);
        }
        return R.data(toView(entity));
    }

    @ApiOperation("Create a custom agent definition")
    @PostMapping
    public R<AgentDefinitionView> create(@RequestBody AgentDefinitionRequest request) {
        try {
            validateToolIds(request.getToolIds());
            AgentDefinitionEntity created = definitionService.create(
                    toEntity(request), currentTenantId(), SecurityContextUtil.getUserId());
            return R.data(toView(created));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Update a custom agent definition")
    @PutMapping("/{id}")
    public R<AgentDefinitionView> update(@PathVariable Long id,
            @RequestBody AgentDefinitionRequest request) {
        try {
            requireOwner(id);
            validateToolIds(request.getToolIds());
            AgentDefinitionEntity updated = definitionService.update(
                    id, toEntity(request), currentTenantId());
            return R.data(toView(updated));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Delete a custom agent definition")
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        try {
            requireOwner(id);
            definitionService.delete(id, currentTenantId());
            return R.data(null);
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    // ---- Mapping ----

    private AgentDefinitionEntity toEntity(AgentDefinitionRequest request) {
        AgentDefinitionEntity entity = new AgentDefinitionEntity();
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setSystemPrompt(request.getSystemPrompt());
        entity.setModelName(request.getModelName());
        entity.setMaxIterations(request.getMaxIterations());
        entity.setEnabled(request.getEnabled());
        if (request.getToolIds() != null && !request.getToolIds().isEmpty()) {
            try {
                entity.setToolIds(objectMapper.writeValueAsString(request.getToolIds()));
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid toolIds: " + e.getMessage());
            }
        } else {
            entity.setToolIds(null);
        }
        return entity;
    }

    private AgentDefinitionView toView(AgentDefinitionEntity entity) {
        AgentDefinitionView view = new AgentDefinitionView();
        view.setId(entity.getId());
        view.setName(entity.getName());
        view.setDescription(entity.getDescription());
        view.setSystemPrompt(entity.getSystemPrompt());
        view.setModelName(entity.getModelName());
        view.setToolIds(new java.util.ArrayList<>(
                definitionService.parseToolIds(entity.getToolIds())));
        view.setMaxIterations(entity.getMaxIterations());
        view.setEnabled(entity.getEnabled());
        view.setCreateTime(entity.getCreateTime());
        view.setUpdateTime(entity.getUpdateTime());
        return view;
    }

    /** Definitions are shared in a tenant, but only the creator may edit/delete. */
    private void requireOwner(Long id) {
        Long tenantId = currentTenantId();
        AgentDefinitionEntity existing = definitionService.get(id, tenantId);
        if (existing == null) {
            throw new IllegalArgumentException("Agent definition not found: " + id);
        }
        Long currentUserId = SecurityContextUtil.getUserId();
        if (existing.getUserId() != null && currentUserId != null
                && !existing.getUserId().equals(currentUserId)) {
            throw new IllegalArgumentException("Only the creator can modify this agent definition");
        }
    }

    /** Reject unknown tool ids before persisting them. */
    private void validateToolIds(java.util.List<String> toolIds) {
        if (toolIds == null || toolIds.isEmpty()) {
            return;
        }
        for (String toolId : toolIds) {
            if (toolRegistry.get(toolId) == null) {
                throw new IllegalArgumentException("Unknown backend tool: " + toolId);
            }
        }
    }

    private Long currentTenantId() {
        String tenantIdStr = SecurityContextUtil.getTenantId();
        if (tenantIdStr == null || tenantIdStr.isEmpty()) {
            throw new IllegalStateException("Missing tenant context");
        }
        return Long.parseLong(tenantIdStr);
    }

    // ---- DTOs ----

    /**
     * Create/update request body; toolIds as a JSON array (empty = all backend
     * tools).
     */
    @Data
    public static class AgentDefinitionRequest {
        private String name;
        private String description;
        private String systemPrompt;
        private String modelName;
        private List<String> toolIds;
        private Integer maxIterations;
        private Boolean enabled;
    }

    /** API view of a definition (toolIds decoded from the JSON column). */
    @Data
    public static class AgentDefinitionView {
        private Long id;
        private String name;
        private String description;
        private String systemPrompt;
        private String modelName;
        private List<String> toolIds;
        private Integer maxIterations;
        private Boolean enabled;
        private LocalDateTime createTime;
        private LocalDateTime updateTime;
    }

    /** Backend tool descriptor for the definition editor's tool multi-select. */
    @Data
    public static class ToolView {
        private String id;
        private String description;
    }
}
