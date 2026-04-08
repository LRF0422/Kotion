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

const serverConfig = {
    extensions: [
        new Logger(),
    ],
    port: parseInt(process.env.PORT || "1234", 10),
};

// Add SSL config if enabled
if (sslConfig) {
    serverConfig.ssl = sslConfig;
}

const server = Server.configure(serverConfig);
server.listen();

console.log(`Room server started on port ${serverConfig.port} (SSL: ${sslEnabled && sslConfig ? "enabled" : "disabled"})`);

