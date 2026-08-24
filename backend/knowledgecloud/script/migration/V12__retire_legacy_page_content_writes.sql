-- Freeze the retired page-content/version stores at cutover.
--
-- Apply this only in the same maintenance/blue-green cutover that enables the
-- PageDoc-only backend. It intentionally makes an old application instance fail
-- loudly instead of acknowledging a save that the new authority will never read.
-- The migration backfill is unaffected because it only SELECTs these tables.

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_block_insert`;
CREATE TRIGGER `trg_retire_wiki_page_block_insert`
    BEFORE INSERT ON `wiki_page_block`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_block is read-only; use PageDoc';

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_block_update`;
CREATE TRIGGER `trg_retire_wiki_page_block_update`
    BEFORE UPDATE ON `wiki_page_block`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_block is read-only; use PageDoc';

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_block_delete`;
CREATE TRIGGER `trg_retire_wiki_page_block_delete`
    BEFORE DELETE ON `wiki_page_block`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_block is read-only; use PageDoc';

DROP TRIGGER IF EXISTS `trg_retire_wiki_block_version_insert`;
CREATE TRIGGER `trg_retire_wiki_block_version_insert`
    BEFORE INSERT ON `wiki_block_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_block_version is retired; use wiki_page_op';

DROP TRIGGER IF EXISTS `trg_retire_wiki_block_version_update`;
CREATE TRIGGER `trg_retire_wiki_block_version_update`
    BEFORE UPDATE ON `wiki_block_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_block_version is retired; use wiki_page_op';

DROP TRIGGER IF EXISTS `trg_retire_wiki_block_version_delete`;
CREATE TRIGGER `trg_retire_wiki_block_version_delete`
    BEFORE DELETE ON `wiki_block_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_block_version is retired; use wiki_page_op';

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_version_insert`;
CREATE TRIGGER `trg_retire_wiki_page_version_insert`
    BEFORE INSERT ON `wiki_page_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_version is retired; use PageDoc checkpoints';

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_version_update`;
CREATE TRIGGER `trg_retire_wiki_page_version_update`
    BEFORE UPDATE ON `wiki_page_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_version is retired; use PageDoc checkpoints';

DROP TRIGGER IF EXISTS `trg_retire_wiki_page_version_delete`;
CREATE TRIGGER `trg_retire_wiki_page_version_delete`
    BEFORE DELETE ON `wiki_page_version`
    FOR EACH ROW SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'wiki_page_version is retired; use PageDoc checkpoints';
