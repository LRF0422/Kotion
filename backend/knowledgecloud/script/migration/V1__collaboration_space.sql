-- ============================================================
-- Collaboration Space - Phase 1 Migration Script
-- Adds team space support with member management
-- ============================================================

-- 1. Alter wiki_space table to add new columns
ALTER TABLE `wiki_space`
    ADD COLUMN `visibility` VARCHAR(20) DEFAULT 'PRIVATE' COMMENT 'Space visibility: PUBLIC or PRIVATE',
    ADD COLUMN `archived` TINYINT(1) DEFAULT 0 COMMENT 'Whether the space is archived';

-- 2. Create wiki_space_member table
CREATE TABLE IF NOT EXISTS `wiki_space_member` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `space_id` BIGINT NOT NULL COMMENT 'Space ID',
    `user_id` BIGINT NOT NULL COMMENT 'Member user ID',
    `role` VARCHAR(20) NOT NULL DEFAULT 'MEMBER' COMMENT 'Role: OWNER, ADMIN, MEMBER, GUEST',
    `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Join timestamp',
    `invited_by` BIGINT DEFAULT NULL COMMENT 'Who invited this member',
    `tenant_id` VARCHAR(12) DEFAULT '' COMMENT 'Tenant ID',
    `create_user` BIGINT DEFAULT NULL COMMENT 'Creator',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Create time',
    `update_user` BIGINT DEFAULT NULL COMMENT 'Updater',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    `is_deleted` INT DEFAULT 0 COMMENT 'Soft delete flag',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_space_user` (`space_id`, `user_id`, `is_deleted`),
    KEY `idx_space_id` (`space_id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Space member relationship table';

-- 3. Create wiki_space_activity table (for Phase 2, created now for forward compatibility)
CREATE TABLE IF NOT EXISTS `wiki_space_activity` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `space_id` BIGINT NOT NULL COMMENT 'Space ID',
    `user_id` BIGINT NOT NULL COMMENT 'Actor user ID',
    `action_type` VARCHAR(50) NOT NULL COMMENT 'Action type: PAGE_CREATED, PAGE_EDITED, MEMBER_JOINED, etc.',
    `target_type` VARCHAR(30) DEFAULT NULL COMMENT 'Target type: PAGE, MEMBER, COMMENT',
    `target_id` VARCHAR(64) DEFAULT NULL COMMENT 'Target entity ID',
    `metadata` JSON DEFAULT NULL COMMENT 'Extra metadata (JSON)',
    `tenant_id` VARCHAR(12) DEFAULT '' COMMENT 'Tenant ID',
    `create_user` BIGINT DEFAULT NULL COMMENT 'Creator',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Create time',
    `update_user` BIGINT DEFAULT NULL COMMENT 'Updater',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    `is_deleted` INT DEFAULT 0 COMMENT 'Soft delete flag',
    PRIMARY KEY (`id`),
    KEY `idx_space_time` (`space_id`, `create_time` DESC),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Space activity feed table';

-- 4. Create wiki_page_comment table (for Phase 2, created now for forward compatibility)
CREATE TABLE IF NOT EXISTS `wiki_page_comment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `page_id` BIGINT NOT NULL COMMENT 'Page ID',
    `user_id` BIGINT NOT NULL COMMENT 'Comment author user ID',
    `content` TEXT NOT NULL COMMENT 'Comment content (supports Markdown)',
    `parent_id` BIGINT DEFAULT NULL COMMENT 'Parent comment ID for replies',
    `mentions` JSON DEFAULT NULL COMMENT 'Mentioned user IDs (JSON array)',
    `reactions` JSON DEFAULT NULL COMMENT 'Emoji reactions (JSON object)',
    `resolved` TINYINT(1) DEFAULT 0 COMMENT 'Whether the comment is resolved',
    `tenant_id` VARCHAR(12) DEFAULT '' COMMENT 'Tenant ID',
    `create_user` BIGINT DEFAULT NULL COMMENT 'Creator',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Create time',
    `update_user` BIGINT DEFAULT NULL COMMENT 'Updater',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    `is_deleted` INT DEFAULT 0 COMMENT 'Soft delete flag',
    PRIMARY KEY (`id`),
    KEY `idx_page_id` (`page_id`),
    KEY `idx_parent_id` (`parent_id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Page comment table';

-- 5. Alter wiki_page table to add tags and pinned columns (Phase 2)
ALTER TABLE `wiki_page`
    ADD COLUMN `pinned` TINYINT(1) DEFAULT 0 COMMENT 'Whether the page is pinned/featured',
    ADD COLUMN `tags` JSON DEFAULT NULL COMMENT 'Page tags (JSON array of strings)';
