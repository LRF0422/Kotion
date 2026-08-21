-- ============================================================
-- Page save rewrite: DB-authoritative block storage with an op journal
--
-- Replaces the wiki_page_block / wiki_block_version / wiki_page_version trio.
-- Those tables stay in place for now; nothing reads or writes these new ones
-- until the frontend switches over (stage 2). The old tables are dropped in a
-- later migration once the new path has run a release cycle.
--
-- Four design decisions are encoded in this schema:
--
-- 1. DB is the only authority. The collaborative Y.Doc is a live relay between
--    online users and persists nothing.
-- 2. Clients submit intent (ops), not state.
-- 3. Order is arbitrated server-side. Clients say "after block X"; the server
--    assigns the rank.
-- 4. History is the op journal itself, made bounded by materialised
--    checkpoints.
-- ============================================================

-- ------------------------------------------------------------
-- wiki_block — current state of every addressable block
--
-- `node` holds the block's COMPLETE ProseMirror subtree, inline content
-- included, and is returned verbatim on read. Nothing is ever reassembled from
-- child rows. This is what permanently removes the class of defect where
-- rebuilding a container from its children destroyed the container's own inline
-- content.
--
-- Which node types get a row is decided by an explicit whitelist shared by
-- frontend and backend ("does this need to be addressed independently?" —
-- comment anchors, link targets, AI edit targets, search hit units), not by
-- "every extension that happens to carry an id attribute".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wiki_block`
(
    `block_id`   VARCHAR(64)  NOT NULL COMMENT '块ID，前端生成，全生命周期稳定，禁止重生',
    `page_id`    BIGINT(20)   NOT NULL COMMENT '所属页面',
    -- Empty string, not NULL, means "top level". MySQL treats NULLs as distinct
    -- in a unique index, so a nullable parent_id would silently exempt every
    -- top-level block from uk_block_sibling_rank below — losing the constraint
    -- exactly where ordering matters most.
    `parent_id`  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '父块ID，空字符串表示顶层',
    -- Named `block_rank`, not `rank`: RANK is a reserved word in MySQL 8.0 (window
    -- functions), so an unquoted `SELECT rank FROM ...` is a syntax error. The ORM
    -- does not quote generated identifiers, so the column cannot be called `rank`.
    `block_rank` VARCHAR(128) NOT NULL COMMENT '分数索引，同级顺序的唯一权威，由服务端生成',
    `type`       VARCHAR(50)  NOT NULL COMMENT '节点类型',
    `node`       JSON         NOT NULL COMMENT '该块完整的 PM 子树（含全部内联内容），读取时原样返回',
    `node_hash`  VARCHAR(64)  NOT NULL COMMENT 'node 的哈希，用于跳过未变更写入而不必读 JSON 比对',
    `text`       MEDIUMTEXT   NULL COMMENT '派生的纯文本，仅供搜索与 diff',
    `rev`        BIGINT(20)   NOT NULL COMMENT '该行最后一次变更时的页面 rev',
    PRIMARY KEY (`block_id`) USING BTREE,
    -- Two siblings can never share a rank: this is what makes order a hard
    -- invariant rather than a convention the writer is trusted to honour.
    UNIQUE KEY `uk_block_sibling_rank` (`page_id`, `parent_id`, `block_rank`),
    KEY `idx_block_page_rank` (`page_id`, `block_rank`),
    KEY `idx_block_page_rev` (`page_id`, `rev`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT ='页面块当前状态（权威）';

-- ------------------------------------------------------------
-- wiki_page_head — version pointer and write serialisation point
--
-- Every write transaction opens with `SELECT ... FOR UPDATE` on this page's row.
-- Page-scoped row lock, so same-page writes serialise naturally and
-- different-page writes never contend.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wiki_page_head`
(
    `page_id`    BIGINT(20) NOT NULL COMMENT '页面ID',
    `rev`        BIGINT(20) NOT NULL DEFAULT 0 COMMENT '单调递增，每个被接受的 op 批次 +1',
    `last_actor` BIGINT(20) NULL COMMENT '最后一次写入者',
    `updated_at` DATETIME   NULL COMMENT '最后一次写入时间',
    PRIMARY KEY (`page_id`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT ='页面写入串行点与版本指针';

-- ------------------------------------------------------------
-- wiki_page_op — append-only journal; this IS the history
--
-- Stores the ops AS ARBITRATED BY THE SERVER, not the client's raw request:
-- ranks already resolved, delete cascades already expanded. Replay is therefore
-- deterministic and never has to re-run the resolution logic (which could have
-- changed since).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wiki_page_op`
(
    `id`              BIGINT(20)   NOT NULL AUTO_INCREMENT,
    `page_id`         BIGINT(20)   NOT NULL COMMENT '页面ID',
    `rev`             BIGINT(20)   NOT NULL COMMENT '该批次产生的页面 rev',
    `actor`           BIGINT(20)   NULL COMMENT '写入者用户ID',
    `ops`             JSON         NOT NULL COMMENT '归一化后的 op 数组（rank 已解析、删除已展开）',
    `idempotency_key` VARCHAR(64)  NULL COMMENT '客户端批次幂等键，重试安全',
    `created_at`      DATETIME     NOT NULL COMMENT '写入时间',
    PRIMARY KEY (`id`) USING BTREE,
    UNIQUE KEY `uk_page_op_rev` (`page_id`, `rev`),
    -- Makes a retried batch a lookup rather than a second application. NULL keys
    -- are intentionally exempt (MySQL treats NULLs as distinct): server-side
    -- writers that submit no key opt out of deduplication.
    UNIQUE KEY `uk_page_op_idem` (`page_id`, `idempotency_key`),
    KEY `idx_page_op_page_id` (`page_id`, `id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT ='页面 op 追加式日志，版本历史的本体';

-- ------------------------------------------------------------
-- wiki_page_checkpoint — materialised snapshot, bounds replay cost
--
-- Restoring to an arbitrary rev R = load the nearest checkpoint at rev <= R,
-- then replay ops in (checkpoint.rev, R]. Checkpoint cadence is what makes that
-- interval bounded by construction rather than by hope.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wiki_page_checkpoint`
(
    `id`          BIGINT(20)   NOT NULL AUTO_INCREMENT,
    `page_id`     BIGINT(20)   NOT NULL COMMENT '页面ID',
    `rev`         BIGINT(20)   NOT NULL COMMENT '该快照对应的页面 rev',
    `kind`        VARCHAR(16)  NOT NULL COMMENT 'AUTO / USER / RESTORE / IMPORT',
    `label`       VARCHAR(255) NULL COMMENT '用户命名的还原点标签',
    `doc`         LONGBLOB     NOT NULL COMMENT '该 rev 的全文 JSON，压缩存储',
    `block_count` INT(11)      NULL COMMENT '块数，供回填校验与历史 UI 使用',
    `actor`       BIGINT(20)   NULL COMMENT '创建者用户ID',
    `created_at`  DATETIME     NOT NULL COMMENT '创建时间',
    PRIMARY KEY (`id`) USING BTREE,
    -- History UI and the restore path both walk checkpoints newest-first; InnoDB
    -- scans this key backwards, so no separate descending index is needed.
    UNIQUE KEY `uk_page_checkpoint_rev` (`page_id`, `rev`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci COMMENT ='页面物化快照，让 op 重放有界';
