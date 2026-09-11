-- Plugin ratings: one score per user per plugin; wiki_plugin.rating/reviews stay
-- as the denormalized aggregate used by the marketplace.
-- Target schema: knowledge_wiki. Restart-safe.
CREATE TABLE IF NOT EXISTS `wiki_plugin_rating` (
    `id`          BIGINT NOT NULL COMMENT 'Primary key',
    `plugin_id`   BIGINT NOT NULL,
    `user_id`     BIGINT NOT NULL,
    `user_name`   VARCHAR(64) NULL,
    `score`       TINYINT NOT NULL COMMENT 'Rating 1-5',
    `tenant_id`   VARCHAR(12) NULL,
    `create_user` BIGINT NULL,
    `create_time` DATETIME NULL,
    `update_user` BIGINT NULL,
    `update_time` DATETIME NULL,
    `is_deleted`  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_plugin_rating_user` (`plugin_id`, `user_id`),
    KEY `idx_plugin_rating_plugin` (`plugin_id`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Per-user plugin ratings';
