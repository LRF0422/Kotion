-- ============================================================
-- Landing operations — phase P2 (V34)
--
-- Growth automation (see docs/OPERATIONS_PLAN.md):
--   * campaign / campaign_send — email touch campaigns on top of the
--                                existing knowledge-message EmailMessageProvider
--   * alert_rule / alert_event — metric anomaly alerting (P2-4)
--   * referral                 — invite / referral program (P2-7)
--
-- Target schema: knowledge. DDL is schema-unqualified; the schema comes from
-- FLYWAY_URL. Restart-safe: every statement is idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS `landing_campaign` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`        VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `name`           VARCHAR(128) NOT NULL,
    `subject`        VARCHAR(255) NOT NULL,
    `preheader`      VARCHAR(255) NULL,
    `template_key`   VARCHAR(191) NULL COMMENT 'landing_resource key of kind EMAIL_TEMPLATE',
    `body_html`      TEXT         NULL COMMENT 'Inline template (used when template_key is empty)',
    `audience`       TEXT         NULL COMMENT 'Audience selector (JSON): { status, tags[], utmSource, days }',
    `status`         VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT | SCHEDULED | SENDING | SENT | FAILED | CANCELLED',
    `scheduled_at`   DATETIME     NULL,
    `started_at`     DATETIME     NULL,
    `finished_at`    DATETIME     NULL,
    `total_count`    INT          NOT NULL DEFAULT 0,
    `sent_count`     INT          NOT NULL DEFAULT 0,
    `failed_count`   INT          NOT NULL DEFAULT 0,
    `open_count`     INT          NOT NULL DEFAULT 0,
    `click_count`    INT          NOT NULL DEFAULT 0,
    `unsubscribe_count` INT       NOT NULL DEFAULT 0,
    `test_email`     VARCHAR(191) NULL,
    `create_user`    BIGINT       NULL,
    `create_time`    DATETIME     NULL,
    `update_user`    BIGINT       NULL,
    `update_time`    DATETIME     NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_campaign_status` (`site_id`, `status`, `scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing email / touch campaigns';

CREATE TABLE IF NOT EXISTS `landing_campaign_send` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `campaign_id`    BIGINT       NOT NULL,
    `subscriber_id`  BIGINT       NULL,
    `email`          VARCHAR(191) NOT NULL,
    `status`         VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING | SENT | FAILED | OPENED | CLICKED | BOUNCED | UNSUBSCRIBED',
    `error`          VARCHAR(512) NULL,
    `tracking_id`    VARCHAR(64)  NOT NULL COMMENT 'Opaque id used by the open pixel and click redirect',
    `sent_at`        DATETIME     NULL,
    `opened_at`      DATETIME     NULL,
    `clicked_at`     DATETIME     NULL,
    `stat_day`       DATE         NULL,
    `create_user`    BIGINT       NULL,
    `create_time`    DATETIME     NULL,
    `update_user`    BIGINT       NULL,
    `update_time`    DATETIME     NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_campaign_tracking` (`tracking_id`),
    KEY `idx_landing_campaign_send` (`campaign_id`, `status`),
    KEY `idx_landing_campaign_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Per-recipient landing campaign delivery rows';

CREATE TABLE IF NOT EXISTS `landing_alert_rule` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`         VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `name`            VARCHAR(128) NOT NULL,
    `metric`          VARCHAR(64)  NOT NULL COMMENT 'CONVERSIONS | VISITORS | PAGEVIEWS | COLLECT_SILENCE | LINK_CLICKS | GOAL_RATE',
    `goal_key`        VARCHAR(64)  NULL COMMENT 'Used when metric = GOAL_RATE',
    `comparator`      VARCHAR(8)   NOT NULL DEFAULT 'LT' COMMENT 'LT | LTE | GT | GTE | DROP_PCT',
    `threshold`       DECIMAL(14,4) NOT NULL DEFAULT 0,
    `window_minutes`  INT          NOT NULL DEFAULT 60,
    `lookback_days`   INT          NOT NULL DEFAULT 1,
    `channels`        VARCHAR(255) NOT NULL DEFAULT 'log' COMMENT 'log | email | webhook (comma separated)',
    `webhook_url`     VARCHAR(512) NULL,
    `enabled`         TINYINT(1)   NOT NULL DEFAULT 1,
    `last_triggered_at` DATETIME   NULL,
    `create_user`     BIGINT       NULL,
    `create_time`     DATETIME     NULL,
    `update_user`     BIGINT       NULL,
    `update_time`     DATETIME     NULL,
    `is_deleted`      INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_alert_enabled` (`site_id`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing metric alert rules';

CREATE TABLE IF NOT EXISTS `landing_alert_event` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `rule_id`       BIGINT       NULL,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `rule_name`     VARCHAR(128) NULL,
    `metric`        VARCHAR(64)  NULL,
    `metric_value`  DECIMAL(14,4) NULL,
    `threshold`     DECIMAL(14,4) NULL,
    `level`         VARCHAR(16)  NOT NULL DEFAULT 'WARN' COMMENT 'WARN | CRITICAL',
    `message`       VARCHAR(512) NULL,
    `notified`      TINYINT(1)   NOT NULL DEFAULT 0,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_alert_event_time` (`site_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing metric alert occurrences';

CREATE TABLE IF NOT EXISTS `landing_referral` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `code`          VARCHAR(32)  NOT NULL COMMENT 'Public referral code',
    `owner_type`    VARCHAR(16)  NOT NULL DEFAULT 'USER' COMMENT 'USER | PARTNER | CAMPAIGN',
    `owner_id`      VARCHAR(64)  NULL,
    `owner_name`    VARCHAR(128) NULL,
    `target`        VARCHAR(512) NOT NULL,
    `clicks`        INT          NOT NULL DEFAULT 0,
    `signups`       INT          NOT NULL DEFAULT 0,
    `activations`   INT          NOT NULL DEFAULT 0,
    `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_referral_code` (`code`),
    KEY `idx_landing_referral_owner` (`site_id`, `owner_type`, `owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing referral / invite codes';

-- Cross-domain journey (P2-3): the product app reports signup / activation
-- events carrying the landing visitor id. Stored in landing_event as
-- event_name IN ('signup','activated') with props.visitorId set (the ingest
-- endpoint POST /ops/journey writes `visitorId` into props), so the joint
-- funnel needs no extra table — only an index to keep it fast.
--
-- 同样改为无条件 ALTER：本迁移只执行一次，避免 Flyway 不支持的
-- `DELIMITER`/复合语句写法。
ALTER TABLE `landing_event`
    ADD KEY `idx_landing_event_visitor` (`site_id`, `visitor_id`, `event_name`);
