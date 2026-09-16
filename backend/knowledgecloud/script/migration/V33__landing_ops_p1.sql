-- ============================================================
-- Landing operations — phase P1 (V33)
--
-- "Operate without a release" (see docs/OPERATIONS_PLAN.md):
--   * resource            — generic config records: SEO / SECTION / PROMOTION /
--                           ASSET / NAV / EMAIL_TEMPLATE / AUDIENCE / ALERT_RULE /
--                           CAMPAIGN_PAGE. One table keeps the editor surface
--                           uniform and avoids a table per content shape.
--   * experiment*         — A/B experiments, variants and exposures (P1-8)
--   * subscriber_tag*     — lead tagging / segmentation (P1-10)
--
-- Target schema: knowledge. DDL is schema-unqualified; the schema comes from
-- FLYWAY_URL. Restart-safe: every statement is idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS `landing_resource` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `res_kind`      VARCHAR(32)  NOT NULL COMMENT 'SEO | SECTION | PROMOTION | ASSET | NAV | FEATURED | EMAIL_TEMPLATE | AUDIENCE | ALERT_RULE | CAMPAIGN_PAGE',
    `res_key`       VARCHAR(191) NOT NULL COMMENT 'Kind-scoped key: SEO=path, SECTION=page, PROMOTION=slot id, ASSET=file key ...',
    `locale`        VARCHAR(16)  NOT NULL DEFAULT 'zh',
    `payload`       TEXT         NULL COMMENT 'Kind-specific document (JSON)',
    `status`        VARCHAR(16)  NOT NULL DEFAULT 'PUBLISHED' COMMENT 'DRAFT | PUBLISHED | OFFLINE',
    `position`      INT          NOT NULL DEFAULT 0,
    `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
    `start_time`    DATETIME     NULL,
    `end_time`      DATETIME     NULL,
    `remark`        VARCHAR(255) NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_resource` (`site_id`, `res_kind`, `res_key`, `locale`),
    KEY `idx_landing_resource_kind` (`site_id`, `res_kind`, `status`, `position`),
    KEY `idx_landing_resource_window` (`site_id`, `res_kind`, `enabled`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing ops config resource (SEO / sections / promotions / assets / experiments metadata)';

CREATE TABLE IF NOT EXISTS `landing_experiment` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`        VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `exp_key`        VARCHAR(64)  NOT NULL COMMENT 'Stable key used by the landing page useExperiment(key)',
    `name`           VARCHAR(128) NOT NULL,
    `hypothesis`     VARCHAR(512) NULL,
    `status`         VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT | RUNNING | PAUSED | FINISHED',
    `traffic_split`  INT          NOT NULL DEFAULT 100 COMMENT 'Share of visitors entering the experiment (0-100)',
    `metric_event`   VARCHAR(64)  NOT NULL DEFAULT 'cta_click' COMMENT 'Primary conversion event',
    `guardrail_note` VARCHAR(255) NULL,
    `start_time`     DATETIME     NULL,
    `end_time`       DATETIME     NULL,
    `create_user`    BIGINT       NULL,
    `create_time`    DATETIME     NULL,
    `update_user`    BIGINT       NULL,
    `update_time`    DATETIME     NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_experiment_key` (`site_id`, `exp_key`),
    KEY `idx_landing_experiment_status` (`site_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing A/B experiments';

CREATE TABLE IF NOT EXISTS `landing_experiment_variant` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `experiment_id`  BIGINT       NOT NULL,
    `variant_key`    VARCHAR(32)  NOT NULL COMMENT 'control / a / b ...',
    `name`           VARCHAR(128) NULL,
    `weight`         INT          NOT NULL DEFAULT 50 COMMENT 'Relative weight inside the experiment (sum need not be 100)',
    `is_control`     TINYINT(1)   NOT NULL DEFAULT 0,
    `payload`        TEXT         NULL COMMENT 'Variant copy / props consumed by the landing page (JSON)',
    `position`       INT          NOT NULL DEFAULT 0,
    `create_user`    BIGINT       NULL,
    `create_time`    DATETIME     NULL,
    `update_user`    BIGINT       NULL,
    `update_time`    DATETIME     NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_experiment_variant` (`experiment_id`, `variant_key`),
    KEY `idx_landing_experiment_variant_exp` (`experiment_id`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing A/B experiment variants';

CREATE TABLE IF NOT EXISTS `landing_experiment_exposure` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`        VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `exp_key`        VARCHAR(64)  NOT NULL,
    `variant_key`    VARCHAR(32)  NOT NULL,
    `visitor_id`     VARCHAR(64)  NOT NULL,
    `session_id`     VARCHAR(64)  NULL,
    `converted`      TINYINT(1)   NOT NULL DEFAULT 0,
    `conversion_event` VARCHAR(64) NULL,
    `stat_day`       DATE         NOT NULL,
    `create_user`    BIGINT       NULL,
    `create_time`    DATETIME     NULL,
    `update_user`    BIGINT       NULL,
    `update_time`    DATETIME     NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_exposure_visitor` (`site_id`, `exp_key`, `visitor_id`),
    KEY `idx_landing_exposure_day` (`site_id`, `exp_key`, `stat_day`),
    KEY `idx_landing_exposure_variant` (`site_id`, `exp_key`, `variant_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing A/B experiment exposures (one row per visitor per experiment)';

CREATE TABLE IF NOT EXISTS `landing_subscriber_tag` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `tag`           VARCHAR(64)  NOT NULL,
    `color`         VARCHAR(16)  NULL,
    `description`   VARCHAR(255) NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_tag` (`site_id`, `tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing subscriber tags';

CREATE TABLE IF NOT EXISTS `landing_subscriber_tag_rel` (
    `id`             BIGINT   NOT NULL AUTO_INCREMENT,
    `subscriber_id`  BIGINT   NOT NULL,
    `tag_id`         BIGINT   NOT NULL,
    `create_user`    BIGINT   NULL,
    `create_time`    DATETIME NULL,
    `update_user`    BIGINT   NULL,
    `update_time`    DATETIME NULL,
    `is_deleted`     INT      NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_subscriber_tag` (`subscriber_id`, `tag_id`),
    KEY `idx_landing_subscriber_tag_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing subscriber <-> tag relation';

-- Subscriber lifecycle additions (double opt-in + unsubscribe) — P1-10.
-- 注意：这里用**无条件的 ALTER TABLE**，而不是 `ADD COLUMN IF NOT EXISTS`
-- （MySQL 5.7 不支持）也不是存储过程（Flyway 的 MySQL 解析器不支持
-- `DELIMITER`/复合语句）。Flyway 按版本号只执行一次，因此不需要幂等；
-- 不要在已应用过本迁移的库上重复执行。
ALTER TABLE `landing_subscriber`
    ADD COLUMN `confirm_token` VARCHAR(64) NULL COMMENT 'Double opt-in token',
    ADD COLUMN `confirmed_at`  DATETIME    NULL COMMENT 'Double opt-in confirmation time',
    ADD COLUMN `unsubscribe_token` VARCHAR(64) NULL COMMENT 'Public unsubscribe token',
    ADD COLUMN `tags`          VARCHAR(512) NULL COMMENT 'Denormalised tag list for CSV export';

ALTER TABLE `landing_subscriber`
    ADD UNIQUE KEY `uk_landing_subscriber_confirm` (`confirm_token`),
    ADD UNIQUE KEY `uk_landing_subscriber_unsub` (`unsubscribe_token`);

-- Landing link extras (P1-9): grouping, ordering and a stable QR payload.
ALTER TABLE `landing_link`
    ADD COLUMN `group_name` VARCHAR(64)  NULL COMMENT 'Channel group for the admin list',
    ADD COLUMN `position`   INT          NOT NULL DEFAULT 0,
    ADD COLUMN `remark`     VARCHAR(255) NULL;
