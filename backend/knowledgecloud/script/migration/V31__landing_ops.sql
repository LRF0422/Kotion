-- ============================================================
-- Landing page operations (V31)
--
-- Self-hosted operations data for apps/landing-page-vite:
--   * event / session      — first-party analytics collection
--   * content / revision   — landing copy CMS (per locale, draft + publish)
--   * subscriber           — update subscription leads
--   * link / link_click     — channel short links with UTM attribution
--   * changelog            — GitHub release aggregation cache
--   * setting              — SEO / social / public landing settings
--
-- Target schema: knowledge — same database the platform services and the rest of
-- the migrations use. DDL is intentionally schema-unqualified, so the actual schema
-- comes from FLYWAY_URL; point it at `knowledge` or the app will not see these tables.
-- Restart-safe: every statement is idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS `landing_event` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `session_id`    VARCHAR(64)  NOT NULL,
    `visitor_id`    VARCHAR(64)  NOT NULL,
    `event_name`    VARCHAR(64)  NOT NULL,
    `path`          VARCHAR(255) NULL,
    `title`         VARCHAR(255) NULL,
    `referrer`      VARCHAR(512) NULL,
    `props`         TEXT         NULL COMMENT 'Custom event payload (JSON)',
    `utm_source`    VARCHAR(128) NULL,
    `utm_medium`    VARCHAR(128) NULL,
    `utm_campaign`  VARCHAR(128) NULL,
    `utm_content`   VARCHAR(128) NULL,
    `utm_term`      VARCHAR(128) NULL,
    `device`        VARCHAR(32)  NULL,
    `browser`       VARCHAR(32)  NULL,
    `os`            VARCHAR(32)  NULL,
    `country`       VARCHAR(8)   NULL,
    `language`      VARCHAR(32)  NULL,
    `stat_day`      DATE         NOT NULL COMMENT 'Reporting day in platform timezone',
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_event_day` (`site_id`, `stat_day`),
    KEY `idx_landing_event_name` (`site_id`, `event_name`, `stat_day`),
    KEY `idx_landing_event_path` (`site_id`, `stat_day`, `path`),
    KEY `idx_landing_event_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page analytics events';

CREATE TABLE IF NOT EXISTS `landing_session` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`       VARCHAR(64)  NOT NULL DEFAULT 'kotion-landing',
    `session_key`   VARCHAR(64)  NOT NULL,
    `visitor_id`    VARCHAR(64)  NOT NULL,
    `first_seen`    DATETIME     NOT NULL,
    `last_seen`     DATETIME     NOT NULL,
    `landing_path`  VARCHAR(255) NULL,
    `referrer`      VARCHAR(512) NULL,
    `utm_source`    VARCHAR(128) NULL,
    `utm_medium`    VARCHAR(128) NULL,
    `utm_campaign`  VARCHAR(128) NULL,
    `utm_content`   VARCHAR(128) NULL,
    `utm_term`      VARCHAR(128) NULL,
    `device`        VARCHAR(32)  NULL,
    `browser`       VARCHAR(32)  NULL,
    `os`            VARCHAR(32)  NULL,
    `country`       VARCHAR(8)   NULL,
    `language`      VARCHAR(32)  NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_session_key` (`session_key`),
    KEY `idx_landing_session_last` (`site_id`, `last_seen`),
    KEY `idx_landing_session_visitor` (`site_id`, `visitor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page analytics sessions';

CREATE TABLE IF NOT EXISTS `landing_content` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `content_key`     VARCHAR(64)  NOT NULL,
    `locale`          VARCHAR(8)   NOT NULL DEFAULT 'zh',
    `draft`           MEDIUMTEXT   NULL COMMENT 'Draft payload (JSON object)',
    `published`       MEDIUMTEXT   NULL COMMENT 'Published payload (JSON object)',
    `content_version` INT          NOT NULL DEFAULT 0,
    `published_at`    DATETIME     NULL,
    `updated_by`      VARCHAR(64)  NULL,
    `create_user`     BIGINT       NULL,
    `create_time`     DATETIME     NULL,
    `update_user`     BIGINT       NULL,
    `update_time`     DATETIME     NULL,
    `is_deleted`      INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_content_key_locale` (`content_key`, `locale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page copy CMS';

CREATE TABLE IF NOT EXISTS `landing_content_revision` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `content_key`   VARCHAR(64)  NOT NULL,
    `locale`        VARCHAR(8)   NOT NULL DEFAULT 'zh',
    `content_version` INT        NOT NULL,
    `payload`       MEDIUMTEXT   NOT NULL,
    `note`          VARCHAR(255) NULL,
    `created_by`    VARCHAR(64)  NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_revision` (`content_key`, `locale`, `content_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page copy revisions';

CREATE TABLE IF NOT EXISTS `landing_subscriber` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `email`         VARCHAR(190) NOT NULL,
    `status`        VARCHAR(16)  NOT NULL DEFAULT 'subscribed' COMMENT 'subscribed|unsubscribed|bounced',
    `source_path`   VARCHAR(255) NULL,
    `referrer`      VARCHAR(512) NULL,
    `utm_source`    VARCHAR(128) NULL,
    `utm_medium`    VARCHAR(128) NULL,
    `utm_campaign`  VARCHAR(128) NULL,
    `ip_hash`       VARCHAR(64)  NULL,
    `note`          VARCHAR(255) NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_subscriber_email` (`email`),
    KEY `idx_landing_subscriber_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page update subscribers';

CREATE TABLE IF NOT EXISTS `landing_link` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `slug`          VARCHAR(64)  NOT NULL,
    `target`        VARCHAR(512) NOT NULL,
    `label`         VARCHAR(128) NULL,
    `channel`       VARCHAR(64)  NULL,
    `utm_source`    VARCHAR(128) NULL,
    `utm_medium`    VARCHAR(128) NULL,
    `utm_campaign`  VARCHAR(128) NULL,
    `utm_content`   VARCHAR(128) NULL,
    `clicks`        INT          NOT NULL DEFAULT 0,
    `enabled`       TINYINT      NOT NULL DEFAULT 1,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_link_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page channel short links';

CREATE TABLE IF NOT EXISTS `landing_link_click` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `slug`        VARCHAR(64)  NOT NULL,
    `referrer`    VARCHAR(512) NULL,
    `ua`          VARCHAR(256) NULL,
    `ip_hash`     VARCHAR(64)  NULL,
    `stat_day`    DATE         NOT NULL,
    `create_user` BIGINT       NULL,
    `create_time` DATETIME     NULL,
    `update_user` BIGINT       NULL,
    `update_time` DATETIME     NULL,
    `is_deleted`  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_landing_click_slug` (`slug`, `stat_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page channel link clicks';

CREATE TABLE IF NOT EXISTS `landing_changelog` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `release_id`    VARCHAR(64)  NOT NULL,
    `tag`           VARCHAR(64)  NULL,
    `name`          VARCHAR(255) NULL,
    `body`          MEDIUMTEXT   NULL,
    `url`           VARCHAR(512) NULL,
    `author`        VARCHAR(128) NULL,
    `prerelease`    TINYINT      NOT NULL DEFAULT 0,
    `pinned`        TINYINT      NOT NULL DEFAULT 0,
    `hidden`        TINYINT      NOT NULL DEFAULT 0,
    `published_at`  DATETIME     NULL,
    `fetched_at`    DATETIME     NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_changelog_release` (`release_id`),
    KEY `idx_landing_changelog_time` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page changelog cache';

CREATE TABLE IF NOT EXISTS `landing_setting` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `setting_key`   VARCHAR(128) NOT NULL,
    `setting_value` TEXT         NULL,
    `create_user`   BIGINT       NULL,
    `create_time`   DATETIME     NULL,
    `update_user`   BIGINT       NULL,
    `update_time`   DATETIME     NULL,
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_landing_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Landing page public settings (SEO / social)';
