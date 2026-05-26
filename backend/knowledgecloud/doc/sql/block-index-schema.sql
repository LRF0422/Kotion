-- 块索引表
DROP TABLE IF EXISTS `wiki_block_index`;
CREATE TABLE `wiki_block_index`
(
    `id`               bigint(20)   NOT NULL COMMENT '主键',
    `create_user`      bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`      bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`      datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`      bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`      datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`       int(2)       NOT NULL DEFAULT 0 COMMENT '是否已删除',
    `tenant_id`        varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `block_id`         varchar(64)  NOT NULL COMMENT '块ID',
    `page_id`          bigint(20)   NOT NULL COMMENT '所属页面ID',
    `type`             varchar(50)  NULL DEFAULT NULL COMMENT '块类型',
    `path`             varchar(500) NULL DEFAULT NULL COMMENT '块在文档树中的路径',
    `content_summary`  varchar(1000) NULL DEFAULT NULL COMMENT '块内容摘要',
    `is_leaf`          tinyint(1)   NULL DEFAULT NULL COMMENT '是否为叶子节点',
    `parent_id`        varchar(64)  NULL DEFAULT NULL COMMENT '父块ID',
    `page_version_id`  bigint(20)   NULL DEFAULT NULL COMMENT '页面版本ID',
    PRIMARY KEY (`id`) USING BTREE,
    UNIQUE INDEX `uk_block_id` (`block_id`) USING BTREE,
    INDEX `idx_page_id` (`page_id`) USING BTREE,
    INDEX `idx_path` (`path`) USING BTREE,
    INDEX `idx_page_version` (`page_version_id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '块索引表';

-- 修改 PageContent 表，添加 path 字段
ALTER TABLE `wiki_page_block` 
ADD COLUMN `path` varchar(500) NULL DEFAULT NULL COMMENT '块在文档树中的路径' AFTER `page_id`;

-- 为现有数据建立索引（可选）
-- CREATE INDEX idx_wiki_page_block_path ON wiki_page_block(path);