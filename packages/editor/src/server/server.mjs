import { Server } from "@hocuspocus/server";
import { SQLite } from "@hocuspocus/extension-sqlite";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { Mysql } from "./plugin/mysql/index.mjs";

const server = Server.configure({
  extensions: [
    new Mysql({
      host: "localhost",
      password: "Liang45623",
      username: "root",
      port: 3306,
      database: "knowledge_wiki",
    }),
    new Redis({
      host: "127.0.0.1",
      port: 6379,
    }),
    // new SQLite(),
    new Logger(),
  ],
  port: 1234,
});
server.listen();
