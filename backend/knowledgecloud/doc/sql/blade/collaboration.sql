-- Collaboration API Tables
-- Generated based on COLLABORATION_API.md

-- =====================================================
-- Table: wiki_collaboration_invitation
-- Description: Stores collaboration invitations
-- =====================================================
CREATE TABLE IF NOT EXISTS `wiki_collaboration_invitation` (
    `id` BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '主键',
    `page_id` BIGINT(20) NOT NULL COMMENT '页面ID',
    `space_id` BIGINT(20) DEFAULT NULL COMMENT '空间ID',
    `invitee_id` BIGINT(20) NOT NULL COMMENT '被邀请人ID',
    `inviter_id` BIGINT(20) NOT NULL COMMENT '邀请人ID',
    `permission` VARCHAR(20) NOT NULL DEFAULT 'READ' COMMENT '权限级别: READ, WRITE, ADMIN',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '邀请状态: PENDING, ACCEPTED, REJECTED, EXPIRED',
    `message` VARCHAR(500) DEFAULT NULL COMMENT '邀请消息',
    `token` VARCHAR(64) DEFAULT NULL COMMENT '邀请链接Token',
    `expires_at` DATETIME DEFAULT NULL COMMENT '过期时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `create_user` BIGINT(20) DEFAULT NULL COMMENT '创建人',
    `create_dept` BIGINT(20) DEFAULT NULL COMMENT '创建部门',
    `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
    `update_user` BIGINT(20) DEFAULT NULL COMMENT '修改人',
    `update_time` DATETIME DEFAULT NULL COMMENT '修改时间',
    `is_deleted` INT(2) DEFAULT 0 COMMENT '是否已删除',
    `tenant_id` VARCHAR(12) DEFAULT '000000' COMMENT '租户ID',
    PRIMARY KEY (`id`),
    KEY `idx_page_id` (`page_id`),
    KEY `idx_invitee_id` (`invitee_id`),
    KEY `idx_inviter_id` (`inviter_id`),
    KEY `idx_status` (`status`),
    KEY `idx_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协作邀请表';

-- =====================================================
-- Table: wiki_page_collaborator
-- Description: Stores page collaborator relationships
-- =====================================================
CREATE TABLE IF NOT EXISTS `wiki_page_collaborator` (
    `id` BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '主键',
    `page_id` BIGINT(20) NOT NULL COMMENT '页面ID',
    `user_id` BIGINT(20) NOT NULL COMMENT '用户ID',
    `permission` VARCHAR(20) NOT NULL DEFAULT 'READ' COMMENT '权限级别: READ, WRITE, ADMIN',
    `invited_by` BIGINT(20) NOT NULL COMMENT '邀请人ID',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `create_user` BIGINT(20) DEFAULT NULL COMMENT '创建人',
    `create_dept` BIGINT(20) DEFAULT NULL COMMENT '创建部门',
    `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
    `update_user` BIGINT(20) DEFAULT NULL COMMENT '修改人',
    `update_time` DATETIME DEFAULT NULL COMMENT '修改时间',
    `status` INT(2) DEFAULT 1 COMMENT '状态',
    `is_deleted` INT(2) DEFAULT 0 COMMENT '是否已删除',
    `tenant_id` VARCHAR(12) DEFAULT '000000' COMMENT '租户ID',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_page_user` (`page_id`, `user_id`),
    KEY `idx_page_id` (`page_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_invited_by` (`invited_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面协作者表';

-- =====================================================
-- Table: wiki_share_link
-- Description: Stores shareable links for pages
-- =====================================================
CREATE TABLE IF NOT EXISTS `wiki_share_link` (
    `id` BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '主键',
    `page_id` BIGINT(20) NOT NULL COMMENT '页面ID',
    `short_code` VARCHAR(20) NOT NULL COMMENT '短链接码',
    `created_by` BIGINT(20) NOT NULL COMMENT '创建人ID',
    `is_public` TINYINT(1) DEFAULT 0 COMMENT '是否公开: 0-否, 1-是',
    `permission` VARCHAR(20) DEFAULT 'READ' COMMENT '权限级别: READ, WRITE',
    `expires_at` DATETIME DEFAULT NULL COMMENT '过期时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `create_user` BIGINT(20) DEFAULT NULL COMMENT '创建人',
    `create_dept` BIGINT(20) DEFAULT NULL COMMENT '创建部门',
    `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
    `update_user` BIGINT(20) DEFAULT NULL COMMENT '修改人',
    `update_time` DATETIME DEFAULT NULL COMMENT '修改时间',
    `status` INT(2) DEFAULT 1 COMMENT '状态',
    `is_deleted` INT(2) DEFAULT 0 COMMENT '是否已删除',
    `tenant_id` VARCHAR(12) DEFAULT '000000' COMMENT '租户ID',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_short_code` (`short_code`),
    KEY `idx_page_id` (`page_id`),
    KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分享链接表';
