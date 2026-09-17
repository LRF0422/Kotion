package com.knowledge.wiki.service.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Encrypts plugin credentials at rest.
 *
 * <p>
 * Algorithm: AES-256-GCM with a fresh random 96-bit IV per record and a 128-bit
 * authentication tag, so ciphertext is both confidential and tamper-evident.
 * Payload layout is {@code "v1:" || base64(iv || ciphertext || tag)}; the
 * version prefix leaves room for key rotation later.
 * </p>
 *
 * <p>
 * The key comes from {@code knowledge.plugin-config.crypto-key} (falling back to
 * {@code kn.plugin-config.crypto-key}, so the {@code KN_PLUGIN_CONFIG_CRYPTO_KEY}
 * environment variable works through Spring's relaxed binding). The value is
 * either a Base64-encoded 32-byte key or a passphrase, which is stretched with
 * SHA-256.
 * </p>
 *
 * <p>
 * <b>Fail closed.</b> With no key configured, {@link #encrypt} and
 * {@link #decrypt} throw instead of silently writing plaintext. Callers should
 * check {@link #isEnabled()} and refuse the write, keeping read paths degraded
 * to "masked, value unavailable" rather than exposing a credential.
 * </p>
 */
@Service
@Slf4j
public class PluginConfigCryptoService {

    /** Marks the payload format so a future key/algorithm change can be detected. */
    static final String PAYLOAD_PREFIX = "v1:";

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String ALGORITHM = "AES";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private static final int KEY_LENGTH_BYTES = 32;
    private static final Charset UTF_8 = Charset.forName("UTF-8");
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final String MISSING_KEY_MESSAGE =
            "Plugin secret encryption is not configured: set knowledge.plugin-config.crypto-key "
                    + "(or the KN_PLUGIN_CONFIG_CRYPTO_KEY environment variable) to a Base64-encoded "
                    + "32-byte key or a passphrase.";

    private final SecretKey key;

    public PluginConfigCryptoService(
            @Value("${knowledge.plugin-config.crypto-key:${kn.plugin-config.crypto-key:}}") String configuredKey) {
        this.key = resolveKey(configuredKey);
        if (this.key == null) {
            log.error("Plugin credential encryption is DISABLED — {}. Plugin configs carrying "
                    + "credentials cannot be saved until this is set.", MISSING_KEY_MESSAGE);
        } else {
            log.info("Plugin credential encryption enabled (AES-256-GCM).");
        }
    }

    /** Whether a usable key is configured. */
    public boolean isEnabled() {
        return key != null;
    }

    /** Encrypt a UTF-8 payload into a {@code v1:} prefixed, Base64-encoded token. */
    public String encrypt(String plaintext) {
        requireKey();
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(UTF_8));

            byte[] payload = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(ciphertext, 0, payload, iv.length, ciphertext.length);

            return PAYLOAD_PREFIX + Base64.getEncoder().encodeToString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt plugin secret", e);
        }
    }

    /**
     * Decrypt a token produced by {@link #encrypt}.
     *
     * @throws IllegalStateException when the key is missing, the payload is
     *                               malformed, or authentication fails (wrong
     *                               key / tampered ciphertext)
     */
    public String decrypt(String payload) {
        if (payload == null || payload.isEmpty()) {
            return null;
        }
        requireKey();
        if (!payload.startsWith(PAYLOAD_PREFIX)) {
            throw new IllegalStateException("Unsupported plugin secret payload version");
        }
        try {
            byte[] raw = Base64.getDecoder().decode(payload.substring(PAYLOAD_PREFIX.length()));
            if (raw.length <= IV_LENGTH_BYTES) {
                throw new IllegalStateException("Plugin secret payload is truncated");
            }
            byte[] iv = Arrays.copyOfRange(raw, 0, IV_LENGTH_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(raw, IV_LENGTH_BYTES, raw.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ciphertext), UTF_8);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to decrypt plugin secret (wrong crypto key or tampered ciphertext)", e);
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new IllegalStateException(MISSING_KEY_MESSAGE);
        }
    }

    /**
     * Accepts either a Base64-encoded 32-byte key or a passphrase. Returns
     * {@code null} when nothing is configured.
     */
    private static SecretKey resolveKey(String configured) {
        if (configured == null || configured.trim().isEmpty()) {
            return null;
        }
        String trimmed = configured.trim();

        byte[] decoded = null;
        try {
            decoded = Base64.getDecoder().decode(trimmed);
        } catch (IllegalArgumentException ignored) {
            // Not Base64 — fall through to passphrase stretching.
        }
        if (decoded != null && decoded.length == KEY_LENGTH_BYTES) {
            return new SecretKeySpec(decoded, ALGORITHM);
        }

        try {
            byte[] stretched = MessageDigest.getInstance("SHA-256").digest(trimmed.getBytes("UTF-8"));
            return new SecretKeySpec(stretched, ALGORITHM);
        } catch (UnsupportedEncodingException | java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("Unable to derive a plugin secret encryption key", e);
        }
    }
}
