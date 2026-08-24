-- Additive provenance metadata for the PageDoc command/history API.
-- V10 remains the authority for table semantics and one-checkpoint-per-rev.

ALTER TABLE `wiki_page_checkpoint`
    ADD COLUMN `source_rev` BIGINT(20) NULL COMMENT 'RESTORE 检查点所恢复的原始 rev' AFTER `actor`;
