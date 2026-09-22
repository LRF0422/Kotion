import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

// SSL configuration
const sslEnabled = process.env.SSL_ENABLED === "true";
const sslKeyPath = process.env.SSL_KEY_PATH || "./certs/server.key";
const sslCertPath = process.env.SSL_CERT_PATH || "./certs/server.crt";

let sslConfig = undefined;

if (sslEnabled) {
    try {
        sslConfig = {
            key: fs.readFileSync(path.resolve(sslKeyPath)),
            cert: fs.readFileSync(path.resolve(sslCertPath)),
        };
        console.log("SSL enabled with certificates from:", sslKeyPath, sslCertPath);
    } catch (error) {
        console.error("Failed to load SSL certificates:", error.message);
        console.log("Falling back to non-SSL mode");
        sslConfig = undefined;
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
//
// Without this hook the room name is the only thing needed to join a room:
// anyone who can guess or obtain a page id can read and write another user's
// live document. Clients already send their OAuth2 access token, so all that is
// missing is server-side verification.
//
// Verification is delegated to the wiki service, which owns page permissions.
// The client's own token is forwarded, so joining a room requires the same
// permission as reading the page over REST.

const authApiBaseUrl = (process.env.AUTH_API_BASE_URL || "").replace(/\/+$/, "");
const authTimeoutMs = parseInt(process.env.AUTH_TIMEOUT_MS || "5000", 10);

/** Room names are `page:{pageId}`. Anything else is not an authorizable room. */
const parsePageId = (documentName) => {
    const match = /^page:(\d+)$/.exec(documentName || "");
    return match ? match[1] : null;
};

/**
 * Ask the wiki service whether `token` grants access to `pageId`.
 *
 * Once `AUTH_API_BASE_URL` is configured this is strict: an unreachable or
 * erroring auth service denies the connection. A security control that fails
 * open is not a control, and the collaboration server is useless without the
 * backend anyway (page content lives in the DB).
 */
/**
 * Collaboration invitations are accepted by users living in a different identity
 * context than the page owner, so their OAuth token cannot authorize the room
 * through the tenant-scoped `/space/page/:id/collab/authorize` route. The
 * invitation token is an additional bearer credential scoped to exactly one
 * page, and the invitee's access token is still required to bind it to a user,
 * so both are sent as a JSON payload: { accessToken, invitationToken }.
 */
const parseAuthToken = (raw) => {
    if (typeof raw === "string" && raw.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return {
                    accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "",
                    invitationToken: typeof parsed.invitationToken === "string" ? parsed.invitationToken : "",
                };
            }
        } catch {
            // Not our JSON envelope — fall through and treat it as a bare token.
        }
    }
    return { accessToken: typeof raw === "string" ? raw : "", invitationToken: "" };
};

const authorizePage = async (pageId, rawToken) => {
    const { accessToken, invitationToken } = parseAuthToken(rawToken);
    const url = invitationToken
        ? authApiBaseUrl + "/knowledge-wiki/collaboration/invitation/" + encodeURIComponent(invitationToken) + "/collab/authorize?pageId=" + encodeURIComponent(pageId)
        : authApiBaseUrl + "/knowledge-wiki/space/page/" + pageId + "/collab/authorize";
    const response = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken },
        signal: AbortSignal.timeout(authTimeoutMs),
    });
    if (!response.ok) {
        throw new Error("auth service returned HTTP " + response.status);
    }
    // Business failures come back as HTTP 4xx *and* a non-200 body code; check
    // both so a future change to either layer cannot silently grant access.
    const body = await response.json();
    if (body?.code !== 200 || body?.success !== true) {
        throw new Error("auth service denied: code=" + body?.code + " msg=" + body?.msg);
    }
};

const onAuthenticate = async ({ documentName, token }) => {
    if (!token) {
        throw new Error("Unauthorized: no token");
    }

    const pageId = parsePageId(documentName);
    if (pageId === null) {
        throw new Error("Unauthorized: unrecognised room name " + JSON.stringify(documentName));
    }

    try {
        await authorizePage(pageId, token);
    } catch (error) {
        console.warn("[auth] denied " + documentName + ": " + error.message);
        throw new Error("Unauthorized");
    }
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
//
// The Y.Doc is the live source of truth. Without a persistence extension it
// only exists in memory: the last client leaving (or a restart) drops it, and
// the client then re-seeds from the page JSON. Anything kept beside the
// document rather than inside its node attributes is lost at that point — the
// spreadsheet L3 workbook map is exactly such data. Persisting the whole Y.Doc
// makes it survive room close and restart.

const dbHost = process.env.DB_HOST || "";
const dbTable = (process.env.DB_TABLE || "collab_documents").replace(/[^A-Za-z0-9_]/g, "") || "collab_documents";

let pool = null;
if (dbHost) {
    pool = mysql.createPool({
        host: dbHost,
        port: parseInt(process.env.DB_PORT || "3306", 10),
        user: process.env.DB_USERNAME || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_DATABASE || "knowledge_wiki",
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_POOL_SIZE || "10", 10),
        charset: "utf8mb4",
    });
}

const ensureSchema = async () => {
    if (!pool) return;
    await pool.query(
        "CREATE TABLE IF NOT EXISTS " + dbTable + " (" +
            "name VARCHAR(191) NOT NULL PRIMARY KEY, " +
            "data LONGBLOB NOT NULL, " +
            "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    );
    console.log("[persist] MySQL store ready (table: " + dbTable + ")");
};

const extensions = [new Logger()];

if (pool) {
    try {
        await ensureSchema();
    } catch (error) {
        // A misconfigured database must not take collaboration down entirely; fall
        // back to in-memory rooms, loudly.
        console.error("[persist] MySQL unavailable, falling back to IN-MEMORY rooms:", error.message);
        try {
            await pool.end();
        } catch {
            // Pool already unusable.
        }
        pool = null;
    }
}

if (pool) {
    extensions.push(
        new Database({
            // Batch writes: a fast editor would otherwise persist on every update.
            debounce: parseInt(process.env.STORE_DEBOUNCE_MS || "2000", 10),
            maxDebounce: parseInt(process.env.STORE_MAX_DEBOUNCE_MS || "10000", 10),
            fetch: async ({ documentName }) => {
                const [rows] = await pool.query(
                    "SELECT data FROM " + dbTable + " WHERE name = ? LIMIT 1",
                    [documentName],
                );
                if (!rows.length) return null;
                const data = rows[0].data;
                if (data instanceof Uint8Array) return data;
                if (Buffer.isBuffer(data)) return new Uint8Array(data);
                return null;
            },
            store: async ({ documentName, state }) => {
                await pool.query(
                    "INSERT INTO " + dbTable + " (name, data) VALUES (?, ?) " +
                        "ON DUPLICATE KEY UPDATE data = VALUES(data)",
                    [documentName, Buffer.from(state)],
                );
            },
        }),
    );
} else if (!dbHost) {
    console.warn(
        "[persist] DB_HOST is not set — collaboration rooms are IN-MEMORY ONLY. " +
            "Data stored beside the document (e.g. spreadsheet L3 sheets) is lost when " +
            "the room empties or the server restarts.",
    );
}

// Optional: sync rooms across multiple server instances. Redis is a relay, not a
// durable store, so the Database extension above is still required.
const redisHost = process.env.REDIS_HOST || "";
if (redisHost) {
    extensions.push(
        new Redis({
            host: redisHost,
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        }),
    );
    console.log("[persist] Redis relay enabled (" + redisHost + ")");
}

const serverConfig = {
    extensions,
    port: parseInt(process.env.PORT || "1234", 10),
};

if (authApiBaseUrl) {
    serverConfig.onAuthenticate = onAuthenticate;
} else {
    // Enabling the control has to be a deliberate act (so existing deployments
    // are not cut off by an upgrade), but once enabled it never fails open.
    console.warn(
        "[auth] AUTH_API_BASE_URL is not set — collaboration rooms are UNAUTHENTICATED. " +
            "Any client that knows a page id can read and write that page's live document.",
    );
}

// Add SSL config if enabled
if (sslConfig) {
    serverConfig.ssl = sslConfig;
}

const server = Server.configure(serverConfig);
server.listen();

const shutdown = async (signal) => {
    console.log("Shutting down (" + signal + ") …");
    try {
        await server.destroy();
    } catch (error) {
        console.error("server.destroy failed:", error);
    }
    try {
        if (pool) await pool.end();
    } catch (error) {
        console.error("pool.end failed:", error);
    }
    process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(
    "Room server started on port " + serverConfig.port +
        " (SSL: " + (sslEnabled && sslConfig ? "enabled" : "disabled") +
        ", auth: " + (authApiBaseUrl ? "enabled" : "DISABLED") +
        ", persistence: " + (pool ? "mysql" : "IN-MEMORY") + ")",
);
