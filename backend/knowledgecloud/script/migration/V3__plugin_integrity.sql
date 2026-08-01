-- ============================================================
-- Plugin Subresource Integrity - Migration Script
-- Adds the integrity column to wiki_plugin_version so the
-- frontend can enforce SRI (script integrity + crossorigin)
-- when loading plugin artifacts from the public endpoint.
-- The hash is computed and submitted by the publisher (CI /
-- admin) via /plugin/public/inner; the backend never reads
-- back the OSS object to compute it.
-- ============================================================

ALTER TABLE `wiki_plugin_version` ADD COLUMN `integrity` VARCHAR(128) NULL COMMENT 'SRI hash, e.g. sha384-xxx';
