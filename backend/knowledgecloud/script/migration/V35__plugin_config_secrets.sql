-- ============================================================
-- Plugin configuration: encrypted credential storage
--
-- Background: plugin configs were persisted verbatim — including credentials
-- such as an AI apiKey, a GitHub personalAccessToken, a Zhihu accessSecret and
-- a NetEase account cookie — in the plaintext `config` JSON column, and were
-- returned verbatim by GET /knowledge-wiki/plugin-config[/:pluginKey].
--
-- New model:
--   * `config` holds only non-sensitive fields.
--   * `secret_config` holds the credential fields as an AES-256-GCM encrypted
--     JSON map, e.g. {"apiKey":"sk-..."} → "v1:base64(iv||ciphertext||tag)".
--   * Read APIs never return a credential: each configured one is replaced by
--     the sentinel "__KN_SECRET_MASK__". Clients echo the sentinel back to keep
--     the stored value, send a real value to replace it, or "" to clear it.
--   * POST /knowledge-wiki/plugin-config/:pluginKey/reveal returns the
--     decrypted values for clients that must call a third-party API directly
--     from the browser.
--
-- Existing rows keep their plaintext credentials in `config` until the
-- application migrates them on first read (encrypt into `secret_config`, strip
-- from `config`). That migration runs in the service because it needs the
-- application key; there is intentionally no SQL-only backfill here.
--
-- REQUIRED deployment step: set `knowledge.plugin-config.crypto-key` (or the
-- KN_PLUGIN_CONFIG_CRYPTO_KEY environment variable) to a Base64-encoded 32-byte
-- key, or to a passphrase (stretched with SHA-256). Without it the service
-- refuses to save configs that carry credentials rather than falling back to
-- plaintext. Back the key up: losing it makes stored credentials unreadable.
-- ============================================================

ALTER TABLE `wiki_plugin_config`
    ADD COLUMN `secret_config` TEXT NULL
        COMMENT 'AES-256-GCM encrypted credentials (v1:base64(iv||ciphertext||tag)); NULL when none';
