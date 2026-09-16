-- ============================================================
-- Landing operations — phase P0 (V32)
--
-- Closes the loop on the V31 landing ops stack (see docs/OPERATIONS_PLAN.md):
--   * ops_audit      — who changed which landing config (P0-3)
--   * filter_rule    — internal IP / test device exclusion + sampling (P0-4)
--   * event_dict     — event + property contract, observed vs registered (P0-5)
--   * goal           — named conversion goals shown on the ops dashboard (P0-6)
--   * funnel         — persisted, reusable funnel definitions (P0-7)
--
-- Target schema: knowledge. DDL is schema-unqualified; the schema comes from
-- FLYWAY_URL. Restart-safe: every statement is idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS `landing_ops_audit` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `operator`      VARCHAR(64)  NULL COMMENT 'Operator account / display name',
    `operator_id`   BIGINT       NULL,
    `action`        VARCHAR(64)  NOT NULL COMMENT 'SAVE_DRAFT / PUBLISH / ROLLBACK / CREATE / UPDATE / DELETE / IMPORT ...',
    `target_type`   VARCHAR(64)  NOT NULL COMMENT 'CONTENT / SEO / SECTION / PROMOTION / LINK / GOAL / FUNNEL / EXPERIMENT / SETTING ...',
    `target_key`    VARCHAR(255) NULL COMMENT 'Content key, slug, resource key ...',
    `summary`       VARCHAR(512) NULL COMMENT 'Human readable one-liner',
    `detail`        TEXT         NULL COMMENT 'before/after payload (JSON)',
    `client_ip`     VARCHAR(64)  NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_audit_time` (`site_id`, `create_time`),
    KEY `idx_landing_audit_target` (`target_type`, `target_key`),
    KEY `idx_landing_audit_operator` (`operator`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing ops change audit trail';

CREATE TABLE IF NOT EXISTS `landing_filter_rule` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `rule_name`     VARCHAR(128) NULL,
    `rule_type`     VARCHAR(16)  NOT NULL DEFAULT 'IP' COMMENT 'IP | IP_PREFIX | UA | VISITOR | PATH | EMAIL_DOMAIN',
    `pattern`       VARCHAR(255) NOT NULL COMMENT 'Match expression for rule_type',
    `action`        VARCHAR(16)  NOT NULL DEFAULT 'EXCLUDE' COMMENT 'EXCLUDE | INCLUDE',
    `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
    `remark`        VARCHAR(255) NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_filter_site` (`site_id`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing traffic filter rules (internal IP / bot / test device)';

CREATE TABLE IF NOT EXISTS `landing_event_dict` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `event_name`    VARCHAR(64)  NOT NULL,
    `category`      VARCHAR(32)  NOT NULL DEFAULT 'GENERAL' COMMENT 'NAV / CONVERSION / ENGAGEMENT / FORM / EXPERIMENT / QUALITY / GENERAL',
    `description`   VARCHAR(255) NULL,
    `props_schema`  TEXT         NULL COMMENT 'Property contract (JSON): { "propName": { "type": "...", "required": true } }',
    `status`        VARCHAR(16)  NOT NULL DEFAULT 'REGISTERED' COMMENT 'REGISTERED | DEPRECATED',
    `owner`         VARCHAR(64)  NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_event_dict_name` (`site_id`, `event_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing analytics event + property registry';

CREATE TABLE IF NOT EXISTS `landing_goal` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `goal_key`      VARCHAR(64)  NOT NULL COMMENT 'Stable identifier used by the dashboard',
    `name`          VARCHAR(128) NOT NULL,
    `step_type`     VARCHAR(16)  NOT NULL DEFAULT 'EVENT' COMMENT 'EVENT | PATH',
    `step_value`    VARCHAR(255) NOT NULL COMMENT 'Event name or path expression',
    `description`   VARCHAR(255) NULL,
    `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
    `position`      INT          NOT NULL DEFAULT 0,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_goal_key` (`site_id`, `goal_key`),
    KEY `idx_landing_goal_enabled` (`site_id`, `enabled`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing conversion goals';

CREATE TABLE IF NOT EXISTS `landing_funnel` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `funnel_key`    VARCHAR(64)  NOT NULL,
    `name`          VARCHAR(128) NOT NULL,
    `steps`         TEXT         NOT NULL COMMENT 'Ordered steps (JSON): [{ "label": "...", "type": "event|path", "value": "..." }]',
    `description`   VARCHAR(255) NULL,
    `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
    `position`      INT          NOT NULL DEFAULT 0,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_funnel_key` (`site_id`, `funnel_key`),
    KEY `idx_landing_funnel_enabled` (`site_id`, `enabled`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Saved landing conversion funnels';

-- Sampling / data quality switches live in landing_setting so the public
-- /ops/settings endpoint can advertise them without a new table:
--   public.ops.sample-rate        (0-100, default 100)
--   public.ops.filter-enabled     (true/false)
--   public.ops.data-note          (free text shown on the dashboard)
