package com.knowledge.agent.v3;

import java.util.List;
import java.util.Map;

/** Immutable-ish create command assembled by the transport layer. */
public class CreateTaskCommand {
    public String conversationId;
    public String model;
    public List<Map<String, Object>> messages;
    public List<Map<String, Object>> tools;
    public String mode;
    public Long userId;
    public Long tenantId;
    public String token;
    public String userName;
    public String account;
    public String roleName;
    public Map<String, Object> metadata;
}
