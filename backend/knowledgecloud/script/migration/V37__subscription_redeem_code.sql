-- ============================================================
-- V37: subscription redeem codes (no payment)
-- Admins mint codes; users redeem them for a plan + duration.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_redeem_code (
    id          BIGINT       NOT NULL COMMENT '主键',
    code        VARCHAR(64)  NOT NULL COMMENT '兑换码',
    plan_code   VARCHAR(32)  NOT NULL COMMENT '方案编码',
    days        INT          NULL COMMENT '时长（天），空/<=0 为永久',
    max_uses    INT          NOT NULL DEFAULT 1 COMMENT '最大使用次数',
    used_count  INT          NOT NULL DEFAULT 0 COMMENT '已使用次数',
    expires_at  DATETIME     NULL COMMENT '兑换码过期时间',
    status      INT          NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    remark      VARCHAR(255) NULL COMMENT '备注',
    create_user BIGINT       NULL COMMENT '创建人',
    create_time DATETIME     NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user BIGINT       NULL COMMENT '更新人',
    update_time DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted  INT          NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_subscription_redeem_code (code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅兑换码表';
