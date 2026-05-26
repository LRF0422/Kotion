-- Block version feature migration
-- Adds version counter to wiki_page_block and creates wiki_block_version snapshot table

ALTER TABLE `wiki_page_block` ADD COLUMN `version` INT DEFAULT 1 COMMENT 'block version counter';

CREATE TABLE IF NOT EXISTS `wiki_block_version`
(
    `id`              bigint(20)   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `create_user`     bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`     bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`     datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`     bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`     datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`      int(2)       NOT NULL DEFAULT 0 COMMENT '是否已删除',
    `tenant_id`       varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `block_id`        varchar(64)  NOT NULL COMMENT '块ID',
    `page_id`         bigint(20)   NOT NULL COMMENT '所属页面ID',
    `page_version_id` bigint(20)   NULL DEFAULT NULL COMMENT '关联的页面版本ID',
    `version`         int          NOT NULL DEFAULT 1 COMMENT '块版本号',
    `type`            varchar(50)  NULL DEFAULT NULL COMMENT '块类型',
    `attrs`           text         NULL DEFAULT NULL COMMENT '属性JSON',
    `content`         longtext     NULL DEFAULT NULL COMMENT '块内容JSON(内联子节点)',
    `marks`           text         NULL DEFAULT NULL COMMENT '标记JSON',
    `text`            text         NULL DEFAULT NULL COMMENT '文本内容',
    `parent_id`       varchar(64)  NULL DEFAULT NULL COMMENT '父块ID',
    `path`            varchar(255) NULL DEFAULT NULL COMMENT '块路径',
    `sort_order`      int          NULL DEFAULT 0 COMMENT '同级排序序号',
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `idx_block_version_block` (`block_id`),
    INDEX `idx_block_version_page` (`page_id`),
    INDEX `idx_block_version_pv` (`page_version_id`),
    INDEX `idx_block_version_page_pv` (`page_id`, `page_version_id`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '块版本快照表';
