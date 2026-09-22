import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
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
        ? `${authApiBaseUrl}/knowledge-wiki/collaboration/invitation/${encodeURIComponent(invitationToken)}/collab/authorize?pageId=${encodeURIComponent(pageId)}`
        : `${authApiBaseUrl}/knowledge-wiki/space/page/${pageId}/collab/authorize`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(authTimeoutMs),
    });
    if (!response.ok) {
        throw new Error(`auth service returned HTTP ${response.status}`);
    }
    // Business failures come back as HTTP 4xx *and* a non-200 body code; check
    // both so a future change to either layer cannot silently grant access.
    const body = await response.json();
    if (body?.code !== 200 || body?.success !== true) {
        throw new Error(`auth service denied: code=${body?.code} msg=${body?.msg}`);
    }
};

const onAuthenticate = async ({ documentName, token }) => {
    if (!token) {
        throw new Error("Unauthorized: no token");
    }

    const pageId = parsePageId(documentName);
    if (pageId === null) {
        throw new Error(`Unauthorized: unrecognised room name "${documentName}"`);
    }

    try {
        await authorizePage(pageId, token);
    } catch (error) {
        console.warn(`[auth] denied ${documentName}: ${error.message}`);
        throw new Error("Unauthorized");
    }
};

const serverConfig = {
    extensions: [
        new Logger(),
    ],
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

console.log(`Room server started on port ${serverConfig.port} (SSL: ${sslEnabled && sslConfig ? "enabled" : "disabled"}, auth: ${authApiBaseUrl ? "enabled" : "DISABLED"})`);
