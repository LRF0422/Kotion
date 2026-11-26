package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentFormRequestEntity;
import com.knowledge.agent.core.state.AgentFormRequestStore;
import com.knowledge.agent.core.web.dto.AgentStateDtos;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Server-side form inbox.
 *
 * <pre>
 * POST /api/agent/v1/forms
 * GET  /api/agent/v1/forms/pending?conversationId=
 * GET  /api/agent/v1/forms/{formId}
 * POST /api/agent/v1/forms/{formId}/answer
 * POST /api/agent/v1/forms/{formId}/cancel
 * POST /api/agent/v1/forms/{formId}/ack
 * </pre>
 */
@Api(tags = "Agent Form Requests")
@RestController
@RequestMapping("/api/agent/v1/forms")
public class AgentFormController {

    private final AgentFormRequestStore store;
    private final ObjectMapper objectMapper;

    public AgentFormController(AgentFormRequestStore store, ObjectMapper objectMapper) {
        this.store = store;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @ApiOperation("Create a form request")
    @PostMapping
    public R<AgentStateDtos.FormView> create(@RequestBody AgentStateDtos.FormCreateRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentFormRequestStore.CreateCommand cmd = new AgentFormRequestStore.CreateCommand();
        if (request != null) {
            cmd.setConversationId(request.getConversationId());
            cmd.setRunId(request.getRunId());
            cmd.setCallId(request.getCallId());
            cmd.setTitle(request.getTitle());
            cmd.setSchema(request.getSchema());
            cmd.setExpiresAt(request.getExpiresAt());
        }
        AgentFormRequestEntity entity = store.create(identity.tenantId, identity.userId, cmd);
        return R.data(AgentStateDtos.FormView.of(entity, objectMapper));
    }

    @ApiOperation("List pending forms (server-side inbox)")
    @GetMapping("/pending")
    public R<AgentStateDtos.FormListView> pending(
            @RequestParam(name = "conversationId", required = false) String conversationId,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "limit", defaultValue = "100") int limit) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        List<AgentFormRequestEntity> rows = store.list(identity.tenantId, identity.userId,
                status, conversationId, limit);
        AgentStateDtos.FormListView view = new AgentStateDtos.FormListView();
        view.setCount(rows.size());
        view.setForms(AgentStateDtos.forms(rows, objectMapper));
        return R.data(view);
    }

    @ApiOperation("Get one form")
    @GetMapping("/{formId}")
    public R<AgentStateDtos.FormView> get(@PathVariable String formId) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentFormRequestEntity entity = store.get(identity.tenantId, identity.userId, formId);
        return R.data(AgentStateDtos.FormView.of(entity, objectMapper));
    }

    @ApiOperation("Answer a pending form")
    @PostMapping("/{formId}/answer")
    public R<AgentStateDtos.FormView> answer(@PathVariable String formId,
                                             @RequestBody AgentStateDtos.FormAnswerRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentFormRequestStore.AnswerCommand cmd = new AgentFormRequestStore.AnswerCommand();
        if (request != null) {
            cmd.setValues(request.getValues());
            cmd.setRows(request.getRows());
        }
        AgentFormRequestEntity entity = store.answer(identity.tenantId, identity.userId, formId, cmd);
        return R.data(AgentStateDtos.FormView.of(entity, objectMapper));
    }

    @ApiOperation("Cancel a pending form")
    @PostMapping("/{formId}/cancel")
    public R<AgentStateDtos.FormView> cancel(@PathVariable String formId,
                                             @RequestBody(required = false) AgentStateDtos.FormCancelRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        String reason = request == null ? null : request.getReason();
        AgentFormRequestEntity entity = store.cancel(identity.tenantId, identity.userId, formId, reason);
        return R.data(AgentStateDtos.FormView.of(entity, objectMapper));
    }

    @ApiOperation("Acknowledge delivery of an answered form")
    @PostMapping("/{formId}/ack")
    public R<AgentStateDtos.FormView> ack(@PathVariable String formId) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentFormRequestEntity entity = store.markDelivered(identity.tenantId, identity.userId, formId);
        return R.data(AgentStateDtos.FormView.of(entity, objectMapper));
    }
}