-- ============================================================
-- knowledge-file-center 增量 DDL
-- 新增:媒体类型、回收站、收藏、最近访问
-- 手动执行(项目无 Flyway/Liquibase)
-- ============================================================

ALTER TABLE `knowledge_file` ADD COLUMN `media_type` VARCHAR(16) NULL COMMENT '媒体类型: IMAGE/DOC/DOCX/XLS/XLSX/PDF/OTHER';
ALTER TABLE `knowledge_file` ADD COLUMN `trashed` TINYINT NOT NULL DEFAULT 0 COMMENT '回收站标记: 0=正常 1=已删除';
ALTER TABLE `knowledge_file` ADD COLUMN `trashed_time` DATETIME NULL COMMENT '移入回收站时间';
ALTER TABLE `knowledge_file` ADD COLUMN `favorite` TINYINT NOT NULL DEFAULT 0 COMMENT '收藏标记: 0=否 1=是';
ALTER TABLE `knowledge_file` ADD COLUMN `last_accessed_time` DATETIME NULL COMMENT '最近访问时间';

-- 常用查询索引
CREATE INDEX `idx_knowledge_file_parent_trashed` ON `knowledge_file` (`parent_id`, `trashed`);
CREATE INDEX `idx_knowledge_file_trashed` ON `knowledge_file` (`trashed`);
CREATE INDEX `idx_knowledge_file_favorite` ON `knowledge_file` (`favorite`, `trashed`);
CREATE INDEX `idx_knowledge_file_last_accessed` ON `knowledge_file` (`last_accessed_time`);
