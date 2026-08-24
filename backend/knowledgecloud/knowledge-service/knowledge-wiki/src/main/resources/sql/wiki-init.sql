SET NAMES utf8mb4;
SET
    FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `wiki_space_category`;
CREATE TABLE `wiki_space_category`
(
    `id`          bigint(20)   NOT NULL COMMENT '主键',
    `create_user` bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept` bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time` datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user` bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time` datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`  int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`   varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `name`        varchar(100) NOT NULL COMMENT '空间类型名称',
    `description` varchar(255) NULL DEFAULT NULL COMMENT '描述',
    `icon`        varchar(255) NULL DEFAULT NULL COMMENT '图标',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '空间类型';

DROP TABLE IF EXISTS `wiki_space_permission`;
CREATE TABLE `wiki_space_permission`
(
    `id`             bigint(20)   NOT NULL COMMENT '主键',
    `create_user`    bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`    bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`    datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`    bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`    datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`     int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`      varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `owner_id`       bigint(20)   NOT NULL COMMENT '权限持有者id',
    `owner_name`     varchar(100) NOT NULL COMMENT '权限持有者名称',
    `owner_type`     varchar(50)  NOT NULL COMMENT '权限持有者类型',
    `type`           varchar(50)  NOT NULL COMMENT '权限类型',
    `operation`      varchar(50)  NOT NULL COMMENT '权限内容',
    `has_permission` tinyint(1)   NOT NULL COMMENT '是否拥有权限',
    `space_key`      varchar(255) NOT NULL COMMENT '所属空间',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '空间权限';

DROP TABLE IF EXISTS `wiki_space`;
CREATE TABLE `wiki_space`
(
    `id`            bigint(20)   NOT NULL COMMENT '主键',
    `create_user`   bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`   bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`   datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`   bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`   datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `status`        varchar(10)  NOT NULL COMMENT '状态',
    `is_deleted`    int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`     varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `name`          varchar(100) NOT NULL COMMENT '空间名称',
    `space_key`     varchar(100) NOT NULL unique COMMENT '空间key（唯一）',
    `category_id`   bigint(20)   NOT NULL COMMENT '空间类型id',
    `category_name` varchar(50)  NOT NULL COMMENT '空间类型名称',
    `description`   varchar(255) NULL DEFAULT NULL COMMENT '空间描述',
    `icon`          varchar(255) NULL DEFAULT NULL COMMENT '图标',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '空间';

DROP TABLE IF EXISTS `wiki_page`;
CREATE TABLE `wiki_page`
(
    `id`          bigint(20)   NOT NULL COMMENT '主键',
    `create_user` bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept` bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time` datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user` bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time` datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `status`      varchar(10)  NOT NULL COMMENT '状态',
    `is_deleted`  int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`   varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `parent_id`   bigint(20)   NULL DEFAULT NULL COMMENT '父页面id',
    `title`       varchar(100) NOT NULL COMMENT '页面标题',
    `description` varchar(255) NULL DEFAULT NULL COMMENT '页面描述',
    `ancestors`   text         NULL DEFAULT NULL COMMENT '祖先',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '空间页面';

DROP TABLE IF EXISTS `wiki_page_version`;
CREATE TABLE `wiki_page_version`
(
    `id`                bigint(20)   NOT NULL COMMENT '主键',
    `create_user`       bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`       bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`       datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`       bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`       datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `status`            varchar(10)  NOT NULL COMMENT '状态',
    `is_deleted`        int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`         varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `subject_id`        bigint(20)   NOT NULL COMMENT '页面主体id',
    `version`           varchar(20)  NOT NULL COMMENT '版本号',
    `last_version_id`   bigint(20)   NULL DEFAULT NULL COMMENT '上一个版本id',
    `active_version_id` bigint(20)   NULL DEFAULT NULL COMMENT '当前激活版本id',
    `parent_id`         bigint(20)   NULL DEFAULT NULL COMMENT '父页面id',
    `md5_code`          varchar(100) NULL DEFAULT NULL COMMENT '内容MD5值',
    `title`             varchar(100) NOT NULL COMMENT '页面标题',
    `description`       varchar(255) NULL DEFAULT NULL COMMENT '页面描述',
    `change_summary`    varchar(500) NULL DEFAULT NULL COMMENT '修改摘要',
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `idx_subject_id` (`subject_id`) USING BTREE,
    INDEX `idx_version` (`version`) USING BTREE,
    INDEX `idx_status` (`status`) USING BTREE,
    INDEX `idx_last_version_id` (`last_version_id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '空间页面版本';

DROP TABLE IF EXISTS `wiki_page_content`;
CREATE TABLE `wiki_page_content`
(
    `id`              bigint(20)   NOT NULL COMMENT '主键',
    `create_user`     bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`     bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`     datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`     bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`     datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`      int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`       varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `content`         longtext     NULL DEFAULT NULL COMMENT '页面内容',
    `page_version_id` bigint(20)   NULL DEFAULT NULL COMMENT '页面版本id',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面内容';

DROP TABLE IF EXISTS `wiki_user_group`;
CREATE TABLE `wiki_user_group`
(
    `id`          bigint(20)   NOT NULL COMMENT '主键',
    `create_user` bigint(20)   NULL     DEFAULT NULL COMMENT '创建人',
    `create_dept` bigint(20)   NULL     DEFAULT NULL COMMENT '创建部门',
    `create_time` datetime(0)  NULL     DEFAULT NULL COMMENT '创建时间',
    `update_user` bigint(20)   NULL     DEFAULT NULL COMMENT '修改人',
    `update_time` datetime(0)  NULL     DEFAULT NULL COMMENT '修改时间',
    `is_deleted`  int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`   varchar(100) NULL     DEFAULT NULL COMMENT '租户id',
    `name`        varchar(100) NOT NULL COMMENT '用户组名称',
    `is_default`  tinyint(1)   NOT NULL DEFAULT 1 COMMENT '是否默认用户组',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '用户组';

DROP TABLE IF EXISTS `wiki_watched_object`;
CREATE TABLE `wiki_watched_object`
(
    `id`          bigint(20)  NOT NULL COMMENT '主键',
    `create_user` bigint(20)  NULL DEFAULT NULL COMMENT '创建人',
    `create_dept` bigint(20)  NULL DEFAULT NULL COMMENT '创建部门',
    `create_time` datetime(0) NULL DEFAULT NULL COMMENT '创建时间',
    `update_user` bigint(20)  NULL DEFAULT NULL COMMENT '修改人',
    `update_time` datetime(0) NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`  int(2)      NOT NULL COMMENT '是否已删除',
    `object_id`   bigint(20)  NOT NULL COMMENT '观察目标id',
    `watcher_id`  bigint(20)  NOT NULL COMMENT '观察者id',
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '观察表';

DROP TABLE IF EXISTS `wiki_page_block`;
CREATE TABLE `wiki_page_block`
(
    `id`           varchar(64)  NOT NULL COMMENT '块ID',
    `create_user`  bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`  bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`  datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`  bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`  datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`   int(2)       NOT NULL DEFAULT 0 COMMENT '是否已删除',
    `tenant_id`    varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `page_id`      bigint(20)   NOT NULL COMMENT '所属页面ID',
    `type`         varchar(50)  NULL DEFAULT NULL COMMENT '块类型',
    `attrs`        text         NULL DEFAULT NULL COMMENT '属性JSON',
    `content`      longtext     NULL DEFAULT NULL COMMENT '块内容JSON',
    `marks`        text         NULL DEFAULT NULL COMMENT '标记JSON',
    `text`         text         NULL DEFAULT NULL COMMENT '文本内容',
    `parent_id`    varchar(64)  NULL DEFAULT NULL COMMENT '父块ID',
    `path`         varchar(255) NULL DEFAULT NULL COMMENT '块路径',
    `sort_order`   int          NULL DEFAULT 0 COMMENT '同级排序序号',
    `version`      int          NULL DEFAULT 1 COMMENT '块版本号',
    `content_hash` varchar(64)  NULL DEFAULT NULL COMMENT '内容哈希(用于变更检测)',
    PRIMARY KEY (`id`) USING BTREE,
    KEY `idx_wiki_page_block_page` (`page_id`),
    KEY `idx_wiki_page_block_parent` (`parent_id`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面内容块表';

DROP TABLE IF EXISTS `wiki_block_version`;
CREATE TABLE `wiki_block_version`
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
    `page_version_id` bigint(20)   NULL DEFAULT NULL COMMENT '关联的页面版本ID(发布后回填)',
    `version`         int          NOT NULL DEFAULT 1 COMMENT '块版本号',
    `change_action`   varchar(16)  NULL DEFAULT NULL COMMENT '变更动作 create/update/delete',
    `prev_version`    int          NULL DEFAULT NULL COMMENT '上一版本号',
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
    INDEX `idx_block_version_page_pv` (`page_id`, `page_version_id`),
    INDEX `idx_block_version_block_ver` (`block_id`, `version`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '块版本快照表';

-- PageDoc/PageOp authoritative page content store.
-- Legacy content/version tables above are retained only for migration reads.
DROP TABLE IF EXISTS `wiki_page_checkpoint`;
DROP TABLE IF EXISTS `wiki_page_op`;
DROP TABLE IF EXISTS `wiki_page_head`;
DROP TABLE IF EXISTS `wiki_block`;

CREATE TABLE `wiki_block`
(
    `block_id`   varchar(64)  NOT NULL COMMENT '块ID，生命周期内稳定',
    `page_id`    bigint(20)   NOT NULL COMMENT '所属页面',
    `parent_id`  varchar(64)  NOT NULL DEFAULT '' COMMENT '父块ID，空字符串表示顶层',
    `block_rank` varchar(128) NOT NULL COMMENT '服务端生成的分数索引',
    `type`       varchar(50)  NOT NULL COMMENT '节点类型',
    `node`       json         NOT NULL COMMENT '完整 ProseMirror 子树',
    `node_hash`  varchar(64)  NOT NULL COMMENT '规范化节点哈希',
    `text`       mediumtext   NULL COMMENT '搜索用派生纯文本',
    `rev`        bigint(20)   NOT NULL COMMENT '最后变更页面 rev',
    PRIMARY KEY (`block_id`) USING BTREE,
    UNIQUE KEY `uk_block_sibling_rank` (`page_id`, `parent_id`, `block_rank`),
    KEY `idx_block_page_rank` (`page_id`, `block_rank`),
    KEY `idx_block_page_rev` (`page_id`, `rev`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面块当前状态（权威）';

CREATE TABLE `wiki_page_head`
(
    `page_id`    bigint(20) NOT NULL COMMENT '页面ID',
    `rev`        bigint(20) NOT NULL DEFAULT 0 COMMENT '当前页面 rev',
    `last_actor` bigint(20) NULL COMMENT '最后写入者',
    `updated_at` datetime    NULL COMMENT '最后写入时间',
    PRIMARY KEY (`page_id`) USING BTREE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面写入串行点与版本指针';

CREATE TABLE `wiki_page_op`
(
    `id`              bigint(20)  NOT NULL AUTO_INCREMENT,
    `page_id`         bigint(20)  NOT NULL COMMENT '页面ID',
    `rev`             bigint(20)  NOT NULL COMMENT '该批次产生的页面 rev',
    `actor`           bigint(20)  NULL COMMENT '写入者用户ID',
    `ops`             json        NOT NULL COMMENT '服务端归一化 op 数组',
    `idempotency_key` varchar(64) NULL COMMENT '客户端批次幂等键',
    `created_at`      datetime    NOT NULL COMMENT '写入时间',
    PRIMARY KEY (`id`) USING BTREE,
    UNIQUE KEY `uk_page_op_rev` (`page_id`, `rev`),
    UNIQUE KEY `uk_page_op_idem` (`page_id`, `idempotency_key`),
    KEY `idx_page_op_page_id` (`page_id`, `id`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面 op 追加式日志';

CREATE TABLE `wiki_page_checkpoint`
(
    `id`          bigint(20)   NOT NULL AUTO_INCREMENT,
    `page_id`     bigint(20)   NOT NULL COMMENT '页面ID',
    `rev`         bigint(20)   NOT NULL COMMENT '快照对应页面 rev',
    `kind`        varchar(16)  NOT NULL COMMENT 'AUTO / USER / RESTORE / IMPORT',
    `label`       varchar(255) NULL COMMENT '还原点标签',
    `doc`         longblob     NOT NULL COMMENT '压缩全文 JSON',
    `block_count` int(11)      NULL COMMENT '顶层块数',
    `actor`       bigint(20)   NULL COMMENT '创建者用户ID',
    `source_rev`  bigint(20)   NULL COMMENT 'RESTORE 检查点所恢复的原始 rev',
    `created_at`  datetime     NOT NULL COMMENT '创建时间',
    PRIMARY KEY (`id`) USING BTREE,
    UNIQUE KEY `uk_page_checkpoint_rev` (`page_id`, `rev`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面物化快照';

DROP TABLE IF EXISTS `wiki_link`;
CREATE TABLE `wiki_link`
(
    `id`             bigint(20)   NOT NULL COMMENT '主键',
    `create_user`    bigint(20)   NULL DEFAULT NULL COMMENT '创建人',
    `create_dept`    bigint(20)   NULL DEFAULT NULL COMMENT '创建部门',
    `create_time`    datetime(0)  NULL DEFAULT NULL COMMENT '创建时间',
    `update_user`    bigint(20)   NULL DEFAULT NULL COMMENT '修改人',
    `update_time`    datetime(0)  NULL DEFAULT NULL COMMENT '修改时间',
    `is_deleted`     int(2)       NOT NULL COMMENT '是否已删除',
    `tenant_id`      varchar(100) NULL DEFAULT NULL COMMENT '租户id',
    `source_type`    varchar(20)  NOT NULL COMMENT '来源类型 PAGE/BLOCK',
    `source_id`      varchar(64)  NOT NULL COMMENT '来源ID (pageId 或 blockId)',
    `source_page_id` bigint(20)   NULL DEFAULT NULL COMMENT '来源所属页面ID',
    `target_type`    varchar(20)  NOT NULL COMMENT '目标类型 PAGE/BLOCK',
    `target_id`      varchar(64)  NULL DEFAULT NULL COMMENT '目标ID (pageId 或 blockId)',
    `target_page_id` bigint(20)   NULL DEFAULT NULL COMMENT '目标所属页面ID',
    `link_kind`      varchar(20)  NULL DEFAULT NULL COMMENT '链接类型 NORMAL/MENTION/EMBED',
    `snippet`        varchar(500) NULL DEFAULT NULL COMMENT '链接所在内容片段',
    PRIMARY KEY (`id`) USING BTREE,
    KEY `idx_wiki_link_source` (`source_type`, `source_id`),
    KEY `idx_wiki_link_target` (`target_type`, `target_id`),
    KEY `idx_wiki_link_target_page` (`target_page_id`)
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT = '页面与块双向链接索引表';