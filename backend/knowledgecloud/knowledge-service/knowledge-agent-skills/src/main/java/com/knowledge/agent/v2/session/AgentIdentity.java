package com.knowledge.agent.v2.session;

/**
 * Immutable identity information for the user making the agent request.
 */
public class AgentIdentity {

    private final Long userId;
    private final Long tenantId;
    private final String userName;
    private final String account;
    private final String roleName;
    private final String token;

    private AgentIdentity(Builder builder) {
        this.userId = builder.userId;
        this.tenantId = builder.tenantId;
        this.userName = builder.userName;
        this.account = builder.account;
        this.roleName = builder.roleName;
        this.token = builder.token;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public String getUserName() {
        return userName;
    }

    public String getAccount() {
        return account;
    }

    public String getRoleName() {
        return roleName;
    }

    public String getToken() {
        return token;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Long userId;
        private Long tenantId;
        private String userName;
        private String account;
        private String roleName;
        private String token;

        public Builder userId(Long userId) {
            this.userId = userId;
            return this;
        }

        public Builder tenantId(Long tenantId) {
            this.tenantId = tenantId;
            return this;
        }

        public Builder userName(String userName) {
            this.userName = userName;
            return this;
        }

        public Builder account(String account) {
            this.account = account;
            return this;
        }

        public Builder roleName(String roleName) {
            this.roleName = roleName;
            return this;
        }

        public Builder token(String token) {
            this.token = token;
            return this;
        }

        public AgentIdentity build() {
            return new AgentIdentity(this);
        }
    }
}
