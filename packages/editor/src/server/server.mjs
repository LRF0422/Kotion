import { Server } from "@hocuspocus/server";
import { SQLite } from "@hocuspocus/extension-sqlite";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { Mysql } from "./plugin/mysql/index.mjs";

const server = Server.configure({
  extensions: [
    new Mysql({
      host: process.env.DB_HOST || "localhost",
      password: process.env.DB_PASSWORD || "",
      username: process.env.DB_USERNAME || "root",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      database: process.env.DB_DATABASE || "knowledge_wiki",
    }),
    new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    }),
    // new SQLite(),
    new Logger(),
  ],
  port: parseInt(process.env.PORT || "1234", 10),
});
server.listen();
