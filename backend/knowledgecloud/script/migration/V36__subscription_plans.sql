-- ============================================================
-- V36: Subscription plans (Free / Pro / Pro+) — functionality only, no payment
--
-- This replaces the earlier ad-hoc "membership" design (BASIC/PRO + Ping++).
-- That design is deleted from the codebase and its tables are dropped here:
--   membership_level, user_membership, subscription_order, payment_record.
-- The new model separates three concerns:
--   * subscription_plan              — plan catalog (Free / Pro / Pro+)
--   * subscription_entitlement       — entitlement dictionary (feature / quota)
--   * subscription_plan_entitlement  — per-plan entitlement values (source of truth)
--   * user_subscription              — one row per user (plan + validity window)
--   * subscription_grant_log         — audit trail for admin grants/revocations
--
-- Payment is intentionally out of scope: plans carry display prices only, and
-- subscriptions are granted by platform admins. Quota value -1 means unlimited.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS payment_record;
DROP TABLE IF EXISTS subscription_order;
DROP TABLE IF EXISTS user_membership;
DROP TABLE IF EXISTS membership_level;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS subscription_plan (
    id            BIGINT       NOT NULL COMMENT '主键',
    plan_code     VARCHAR(32)  NOT NULL COMMENT '方案编码 FREE/PRO/PRO_PLUS',
    plan_name     VARCHAR(64)  NOT NULL COMMENT '方案名称',
    description   VARCHAR(500) NULL COMMENT '方案描述',
    tier          INT          NOT NULL DEFAULT 0 COMMENT '档位 0/1/2',
    monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '展示用月付价格（本期不支付）',
    yearly_price  DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '展示用年付价格（本期不支付）',
    highlight     VARCHAR(255) NULL COMMENT '营销卖点',
    sort          INT          NOT NULL DEFAULT 0 COMMENT '排序',
    status        INT          NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    create_user   BIGINT       NULL COMMENT '创建人',
    create_time   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user   BIGINT       NULL COMMENT '更新人',
    update_time   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted    INT          NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_subscription_plan_code (plan_code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅方案表';

CREATE TABLE IF NOT EXISTS subscription_entitlement (
    id          BIGINT       NOT NULL COMMENT '主键',
    ent_code    VARCHAR(64)  NOT NULL COMMENT '权益编码',
    ent_name    VARCHAR(64)  NOT NULL COMMENT '权益名称',
    category    VARCHAR(16)  NOT NULL COMMENT 'FEATURE 能力 / QUOTA 配额',
    value_type  VARCHAR(16)  NOT NULL COMMENT 'BOOLEAN / NUMBER',
    unit        VARCHAR(32)  NULL COMMENT '数值单位',
    description VARCHAR(255) NULL COMMENT '说明',
    sort        INT          NOT NULL DEFAULT 0 COMMENT '排序',
    status      INT          NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    create_user BIGINT       NULL COMMENT '创建人',
    create_time DATETIME     NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user BIGINT       NULL COMMENT '更新人',
    update_time DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted  INT          NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_subscription_entitlement_code (ent_code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅权益定义表';

CREATE TABLE IF NOT EXISTS subscription_plan_entitlement (
    id          BIGINT      NOT NULL COMMENT '主键',
    plan_code   VARCHAR(32) NOT NULL COMMENT '方案编码',
    ent_code    VARCHAR(64) NOT NULL COMMENT '权益编码',
    bool_value  TINYINT(1)  NULL COMMENT '布尔权益取值',
    num_value   BIGINT      NULL COMMENT '数值配额取值，-1 表示不限',
    create_user BIGINT      NULL COMMENT '创建人',
    create_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user BIGINT      NULL COMMENT '更新人',
    update_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted  INT         NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_plan_entitlement (plan_code, ent_code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='方案权益取值表';

CREATE TABLE IF NOT EXISTS user_subscription (
    id          BIGINT      NOT NULL COMMENT '主键',
    user_id     BIGINT      NOT NULL COMMENT '用户ID',
    plan_code   VARCHAR(32) NOT NULL COMMENT '方案编码',
    status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / EXPIRED',
    start_time  DATETIME    NULL COMMENT '生效时间',
    end_time    DATETIME    NULL COMMENT '到期时间；NULL 表示永久',
    source      VARCHAR(16) NULL COMMENT 'ADMIN/TRIAL/REDEEM/MIGRATION/SYSTEM',
    operator_id BIGINT      NULL COMMENT '操作人',
    remark      VARCHAR(255) NULL COMMENT '备注',
    create_user BIGINT      NULL COMMENT '创建人',
    create_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user BIGINT      NULL COMMENT '更新人',
    update_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted  INT         NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_subscription_user (user_id, is_deleted),
    KEY idx_user_subscription_plan (plan_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户订阅关系表';

CREATE TABLE IF NOT EXISTS subscription_grant_log (
    id          BIGINT      NOT NULL COMMENT '主键',
    user_id     BIGINT      NOT NULL COMMENT '用户ID',
    from_plan   VARCHAR(32) NULL COMMENT '变更前方案',
    to_plan     VARCHAR(32) NULL COMMENT '变更后方案',
    source      VARCHAR(16) NULL COMMENT '来源',
    operator_id BIGINT      NULL COMMENT '操作人',
    start_time  DATETIME    NULL COMMENT '生效时间',
    end_time    DATETIME    NULL COMMENT '到期时间',
    remark      VARCHAR(255) NULL COMMENT '备注',
    create_user BIGINT      NULL COMMENT '创建人',
    create_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_user BIGINT      NULL COMMENT '更新人',
    update_time DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted  INT         NOT NULL DEFAULT 0 COMMENT '是否删除',
    PRIMARY KEY (id),
    KEY idx_subscription_grant_user (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅授予日志表';

-- ---------- seed: plans ----------
INSERT IGNORE INTO subscription_plan
    (id, plan_code, plan_name, description, tier, monthly_price, yearly_price, highlight, sort, status, is_deleted)
VALUES
    (1, 'FREE', '免费版', '个人基础使用，含少量 AI 与空间额度', 0, 0.00, 0.00, '个人上手首选', 1, 1, 0),
    (2, 'PRO', '专业版', '放开 AI 与协作，适合个人与小团队', 1, 29.90, 299.00, '最受欢迎', 2, 1, 0),
    (3, 'PRO_PLUS', '专业增强版', '最高额度与全部能力，适合重度用户与团队', 2, 99.00, 999.00, '能力拉满', 3, 1, 0);

-- ---------- seed: entitlement dictionary ----------
INSERT IGNORE INTO subscription_entitlement
    (id, ent_code, ent_name, category, value_type, unit, description, sort, status, is_deleted)
VALUES
    (1,  'core.editor',              '文档编辑',     'FEATURE', 'BOOLEAN', NULL,        '块编辑器完整能力', 1, 1, 0),
    (2,  'space.count',              '空间数量',     'QUOTA',   'NUMBER',  '个',        '可创建的空间总数，-1 不限', 2, 1, 0),
    (3,  'space.members',            '单空间成员',   'QUOTA',   'NUMBER',  '人',        '单个空间可容纳成员数', 3, 1, 0),
    (4,  'storage.bytes',            '存储容量',     'QUOTA',   'NUMBER',  'bytes',     '账号总存储配额', 4, 1, 0),
    (5,  'file.maxSize',             '单文件上限',   'QUOTA',   'NUMBER',  'bytes',     '单个上传文件大小上限', 5, 1, 0),
    (6,  'ai.agent',                 'AI 助手',      'FEATURE', 'BOOLEAN', NULL,        '使用 AI 助手与 Agent 能力', 6, 1, 0),
    (7,  'ai.tokens.daily',          '每日 AI Token','QUOTA',   'NUMBER',  'tokens/天', '每日 AI token 消耗上限，-1 不限', 7, 1, 0),
    (8,  'ai.runs.concurrent',       '并发任务数',   'QUOTA',   'NUMBER',  '个',        '同时运行的 Agent 任务上限', 8, 1, 0),
    (9,  'ai.advancedModels',        '高级模型',     'FEATURE', 'BOOLEAN', NULL,        '使用高级大模型', 9, 1, 0),
    (10, 'plugin.install',           '安装插件',     'FEATURE', 'BOOLEAN', NULL,        '从市场安装插件', 10, 1, 0),
    (11, 'plugin.installed.count',   '已装插件数',   'QUOTA',   'NUMBER',  '个',        '同时安装的插件数量，-1 不限', 11, 1, 0),
    (12, 'plugin.publish',           '发布插件',     'FEATURE', 'BOOLEAN', NULL,        '提交并发布自研插件', 12, 1, 0),
    (13, 'export.pdf',               '导出 PDF',     'FEATURE', 'BOOLEAN', NULL,        '导出为 PDF', 13, 1, 0),
    (14, 'collaboration.team',       '团队协作',     'FEATURE', 'BOOLEAN', NULL,        '邀请成员进入团队空间', 14, 1, 0),
    (15, 'collaboration.guest',      '访客协作',     'FEATURE', 'BOOLEAN', NULL,        '邀请外部访客协作', 15, 1, 0),
    (16, 'support.priority',         '优先支持',     'FEATURE', 'BOOLEAN', NULL,        '优先客服通道', 16, 1, 0);

-- ---------- seed: plan entitlement values ----------
-- FREE (id = 100 + ent_id)
INSERT IGNORE INTO subscription_plan_entitlement (id, plan_code, ent_code, bool_value, num_value, is_deleted) VALUES
    (101, 'FREE', 'core.editor',           1,    NULL,        0),
    (102, 'FREE', 'space.count',           NULL, 3,           0),
    (103, 'FREE', 'space.members',         NULL, 1,           0),
    (104, 'FREE', 'storage.bytes',         NULL, 1073741824,  0),
    (105, 'FREE', 'file.maxSize',          NULL, 67108864,    0),
    (106, 'FREE', 'ai.agent',              1,    NULL,        0),
    (107, 'FREE', 'ai.tokens.daily',       NULL, 50000,       0),
    (108, 'FREE', 'ai.runs.concurrent',    NULL, 1,           0),
    (109, 'FREE', 'ai.advancedModels',     0,    NULL,        0),
    (110, 'FREE', 'plugin.install',        1,    NULL,        0),
    (111, 'FREE', 'plugin.installed.count',NULL, 3,           0),
    (112, 'FREE', 'plugin.publish',        0,    NULL,        0),
    (113, 'FREE', 'export.pdf',            0,    NULL,        0),
    (114, 'FREE', 'collaboration.team',    0,    NULL,        0),
    (115, 'FREE', 'collaboration.guest',   0,    NULL,        0),
    (116, 'FREE', 'support.priority',      0,    NULL,        0);

-- PRO (id = 200 + ent_id)
INSERT IGNORE INTO subscription_plan_entitlement (id, plan_code, ent_code, bool_value, num_value, is_deleted) VALUES
    (201, 'PRO', 'core.editor',           1,    NULL,         0),
    (202, 'PRO', 'space.count',           NULL, 30,           0),
    (203, 'PRO', 'space.members',         NULL, 10,           0),
    (204, 'PRO', 'storage.bytes',         NULL, 53687091200,  0),
    (205, 'PRO', 'file.maxSize',          NULL, 536870912,    0),
    (206, 'PRO', 'ai.agent',              1,    NULL,         0),
    (207, 'PRO', 'ai.tokens.daily',       NULL, 1000000,      0),
    (208, 'PRO', 'ai.runs.concurrent',    NULL, 3,            0),
    (209, 'PRO', 'ai.advancedModels',     1,    NULL,         0),
    (210, 'PRO', 'plugin.install',        1,    NULL,         0),
    (211, 'PRO', 'plugin.installed.count',NULL, -1,           0),
    (212, 'PRO', 'plugin.publish',        1,    NULL,         0),
    (213, 'PRO', 'export.pdf',            1,    NULL,         0),
    (214, 'PRO', 'collaboration.team',    1,    NULL,         0),
    (215, 'PRO', 'collaboration.guest',   0,    NULL,         0),
    (216, 'PRO', 'support.priority',      0,    NULL,         0);

-- PRO_PLUS (id = 300 + ent_id)
INSERT IGNORE INTO subscription_plan_entitlement (id, plan_code, ent_code, bool_value, num_value, is_deleted) VALUES
    (301, 'PRO_PLUS', 'core.editor',           1,    NULL,         0),
    (302, 'PRO_PLUS', 'space.count',           NULL, -1,           0),
    (303, 'PRO_PLUS', 'space.members',         NULL, 50,           0),
    (304, 'PRO_PLUS', 'storage.bytes',         NULL, 214748364800, 0),
    (305, 'PRO_PLUS', 'file.maxSize',          NULL, 2147483648,   0),
    (306, 'PRO_PLUS', 'ai.agent',              1,    NULL,         0),
    (307, 'PRO_PLUS', 'ai.tokens.daily',       NULL, 5000000,      0),
    (308, 'PRO_PLUS', 'ai.runs.concurrent',    NULL, 10,           0),
    (309, 'PRO_PLUS', 'ai.advancedModels',     1,    NULL,         0),
    (310, 'PRO_PLUS', 'plugin.install',        1,    NULL,         0),
    (311, 'PRO_PLUS', 'plugin.installed.count',NULL, -1,           0),
    (312, 'PRO_PLUS', 'plugin.publish',        1,    NULL,         0),
    (313, 'PRO_PLUS', 'export.pdf',            1,    NULL,         0),
    (314, 'PRO_PLUS', 'collaboration.team',    1,    NULL,         0),
    (315, 'PRO_PLUS', 'collaboration.guest',   1,    NULL,         0),
    (316, 'PRO_PLUS', 'support.priority',      1,    NULL,         0);
