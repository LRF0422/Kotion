"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");
let db = null;
const getDbPath = () => {
  const userDataPath = electron.app.getPath("userData");
  const dbDir = path.join(userDataPath, "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, "knowledge.db");
};
const initDatabase = async () => {
  if (db) return db;
  const dbPath = getDbPath();
  console.log("Initializing database at:", dbPath);
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  createTables(db);
  insertDefaultData(db);
  return db;
};
const getDb = () => {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return db;
};
const createTables = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      nickname TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      cover TEXT,
      home_page_id TEXT,
      owner_id TEXT NOT NULL,
      is_personal INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT,
      icon TEXT,
      cover TEXT,
      status TEXT DEFAULT 'active',
      is_template INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (parent_id) REFERENCES pages(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      description TEXT,
      entry_point TEXT,
      icon TEXT,
      author TEXT,
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_plugins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      settings TEXT,
      installed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plugin_id) REFERENCES plugins(id),
      UNIQUE(user_id, plugin_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page_id TEXT,
      space_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (page_id) REFERENCES pages(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'FILE',
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      parent_id TEXT,
      repository_key TEXT,
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES files(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'TEXT',
      status TEXT DEFAULT 'SENT',
      sent_time TEXT DEFAULT (datetime('now')),
      read_time TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS recent_pages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      viewed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (page_id) REFERENCES pages(id),
      UNIQUE(user_id, page_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS space_members (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(space_id, user_id)
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_pages_space_id ON pages(space_id);
    CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
    CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_files_parent_id ON files(parent_id);
    CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files(owner_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_recent_pages_user_id ON recent_pages(user_id);
  `);
};
const insertDefaultData = (database) => {
  const existingUser = database.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!existingUser) {
    const bcrypt2 = require("bcryptjs");
    const { v4: uuidv4 } = require("uuid");
    const userId = uuidv4();
    const passwordHash = bcrypt2.hashSync("admin123", 10);
    database.prepare(`
      INSERT INTO users (id, username, password_hash, email, nickname)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, "admin", passwordHash, "admin@knowledge.local", "Administrator");
    const spaceId = uuidv4();
    database.prepare(`
      INSERT INTO spaces (id, name, description, owner_id, is_personal)
      VALUES (?, ?, ?, ?, ?)
    `).run(spaceId, "Personal Space", "Your personal workspace", userId, 1);
    database.prepare(`
      INSERT INTO space_members (id, space_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), spaceId, userId, "owner");
    const pageId = uuidv4();
    database.prepare(`
      INSERT INTO pages (id, space_id, title, content, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(pageId, spaceId, "Welcome", JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Welcome to Knowledge Desktop!" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "This is your personal knowledge base. Start creating and organizing your notes." }]
        }
      ]
    }), userId);
    database.prepare(`
      UPDATE spaces SET home_page_id = ? WHERE id = ?
    `).run(pageId, spaceId);
    const defaultPlugins = [
      { name: "Main", description: "Core functionality plugin", isBuiltin: 1 },
      { name: "AI Assistant", description: "AI-powered writing assistant", isBuiltin: 1 },
      { name: "File Manager", description: "File management plugin", isBuiltin: 1 },
      { name: "Mermaid", description: "Diagram and flowchart plugin", isBuiltin: 1 },
      { name: "Excalidraw", description: "Whiteboard and drawing plugin", isBuiltin: 1 }
    ];
    for (const plugin of defaultPlugins) {
      const pluginId = uuidv4();
      database.prepare(`
        INSERT INTO plugins (id, name, description, is_builtin)
        VALUES (?, ?, ?, ?)
      `).run(pluginId, plugin.name, plugin.description, plugin.isBuiltin);
      database.prepare(`
        INSERT INTO user_plugins (id, user_id, plugin_id)
        VALUES (?, ?, ?)
      `).run(uuidv4(), userId, pluginId);
    }
    console.log("Default data initialized successfully");
  }
};
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function commonjsRequire(path2) {
  throw new Error('Could not dynamically require "' + path2 + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var bcrypt$1 = { exports: {} };
(function(module2) {
  /**
   * @license bcrypt.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
   * Released under the Apache License, Version 2.0
   * see: https://github.com/dcodeIO/bcrypt.js for details
   */
  (function(global2, factory) {
    if (typeof commonjsRequire === "function" && true && module2 && module2["exports"])
      module2["exports"] = factory();
    else
      (global2["dcodeIO"] = global2["dcodeIO"] || {})["bcrypt"] = factory();
  })(commonjsGlobal, function() {
    var bcrypt2 = {};
    var randomFallback = null;
    function random(len) {
      if (module2 && module2["exports"])
        try {
          return require("crypto")["randomBytes"](len);
        } catch (e) {
        }
      try {
        var a;
        (self["crypto"] || self["msCrypto"])["getRandomValues"](a = new Uint32Array(len));
        return Array.prototype.slice.call(a);
      } catch (e) {
      }
      if (!randomFallback)
        throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
      return randomFallback(len);
    }
    var randomAvailable = false;
    try {
      random(1);
      randomAvailable = true;
    } catch (e) {
    }
    randomFallback = null;
    bcrypt2.setRandomFallback = function(random2) {
      randomFallback = random2;
    };
    bcrypt2.genSaltSync = function(rounds, seed_length) {
      rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof rounds !== "number")
        throw Error("Illegal arguments: " + typeof rounds + ", " + typeof seed_length);
      if (rounds < 4)
        rounds = 4;
      else if (rounds > 31)
        rounds = 31;
      var salt = [];
      salt.push("$2a$");
      if (rounds < 10)
        salt.push("0");
      salt.push(rounds.toString());
      salt.push("$");
      salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
      return salt.join("");
    };
    bcrypt2.genSalt = function(rounds, seed_length, callback) {
      if (typeof seed_length === "function")
        callback = seed_length, seed_length = void 0;
      if (typeof rounds === "function")
        callback = rounds, rounds = void 0;
      if (typeof rounds === "undefined")
        rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
      else if (typeof rounds !== "number")
        throw Error("illegal arguments: " + typeof rounds);
      function _async(callback2) {
        nextTick(function() {
          try {
            callback2(null, bcrypt2.genSaltSync(rounds));
          } catch (err) {
            callback2(err);
          }
        });
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function(resolve, reject) {
          _async(function(err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    };
    bcrypt2.hashSync = function(s, salt) {
      if (typeof salt === "undefined")
        salt = GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof salt === "number")
        salt = bcrypt2.genSaltSync(salt);
      if (typeof s !== "string" || typeof salt !== "string")
        throw Error("Illegal arguments: " + typeof s + ", " + typeof salt);
      return _hash(s, salt);
    };
    bcrypt2.hash = function(s, salt, callback, progressCallback) {
      function _async(callback2) {
        if (typeof s === "string" && typeof salt === "number")
          bcrypt2.genSalt(salt, function(err, salt2) {
            _hash(s, salt2, callback2, progressCallback);
          });
        else if (typeof s === "string" && typeof salt === "string")
          _hash(s, salt, callback2, progressCallback);
        else
          nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof salt)));
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function(resolve, reject) {
          _async(function(err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    };
    function safeStringCompare(known, unknown) {
      var right = 0, wrong = 0;
      for (var i = 0, k = known.length; i < k; ++i) {
        if (known.charCodeAt(i) === unknown.charCodeAt(i))
          ++right;
        else
          ++wrong;
      }
      if (right < 0)
        return false;
      return wrong === 0;
    }
    bcrypt2.compareSync = function(s, hash) {
      if (typeof s !== "string" || typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof s + ", " + typeof hash);
      if (hash.length !== 60)
        return false;
      return safeStringCompare(bcrypt2.hashSync(s, hash.substr(0, hash.length - 31)), hash);
    };
    bcrypt2.compare = function(s, hash, callback, progressCallback) {
      function _async(callback2) {
        if (typeof s !== "string" || typeof hash !== "string") {
          nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof hash)));
          return;
        }
        if (hash.length !== 60) {
          nextTick(callback2.bind(this, null, false));
          return;
        }
        bcrypt2.hash(s, hash.substr(0, 29), function(err, comp) {
          if (err)
            callback2(err);
          else
            callback2(null, safeStringCompare(comp, hash));
        }, progressCallback);
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function(resolve, reject) {
          _async(function(err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    };
    bcrypt2.getRounds = function(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      return parseInt(hash.split("$")[2], 10);
    };
    bcrypt2.getSalt = function(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      if (hash.length !== 60)
        throw Error("Illegal hash length: " + hash.length + " != 60");
      return hash.substring(0, 29);
    };
    var nextTick = typeof process !== "undefined" && process && typeof process.nextTick === "function" ? typeof setImmediate === "function" ? setImmediate : process.nextTick : setTimeout;
    function stringToBytes(str) {
      var out = [], i = 0;
      utfx.encodeUTF16toUTF8(function() {
        if (i >= str.length) return null;
        return str.charCodeAt(i++);
      }, function(b) {
        out.push(b);
      });
      return out;
    }
    var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
    var BASE64_INDEX = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    var stringFromCharCode = String.fromCharCode;
    function base64_encode(b, len) {
      var off = 0, rs = [], c1, c2;
      if (len <= 0 || len > b.length)
        throw Error("Illegal len: " + len);
      while (off < len) {
        c1 = b[off++] & 255;
        rs.push(BASE64_CODE[c1 >> 2 & 63]);
        c1 = (c1 & 3) << 4;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 63]);
          break;
        }
        c2 = b[off++] & 255;
        c1 |= c2 >> 4 & 15;
        rs.push(BASE64_CODE[c1 & 63]);
        c1 = (c2 & 15) << 2;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 63]);
          break;
        }
        c2 = b[off++] & 255;
        c1 |= c2 >> 6 & 3;
        rs.push(BASE64_CODE[c1 & 63]);
        rs.push(BASE64_CODE[c2 & 63]);
      }
      return rs.join("");
    }
    function base64_decode(s, len) {
      var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
      if (len <= 0)
        throw Error("Illegal len: " + len);
      while (off < slen - 1 && olen < len) {
        code = s.charCodeAt(off++);
        c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        code = s.charCodeAt(off++);
        c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c1 == -1 || c2 == -1)
          break;
        o = c1 << 2 >>> 0;
        o |= (c2 & 48) >> 4;
        rs.push(stringFromCharCode(o));
        if (++olen >= len || off >= slen)
          break;
        code = s.charCodeAt(off++);
        c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c3 == -1)
          break;
        o = (c2 & 15) << 4 >>> 0;
        o |= (c3 & 60) >> 2;
        rs.push(stringFromCharCode(o));
        if (++olen >= len || off >= slen)
          break;
        code = s.charCodeAt(off++);
        c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        o = (c3 & 3) << 6 >>> 0;
        o |= c4;
        rs.push(stringFromCharCode(o));
        ++olen;
      }
      var res = [];
      for (off = 0; off < olen; off++)
        res.push(rs[off].charCodeAt(0));
      return res;
    }
    var utfx = function() {
      var utfx2 = {};
      utfx2.MAX_CODEPOINT = 1114111;
      utfx2.encodeUTF8 = function(src, dst) {
        var cp = null;
        if (typeof src === "number")
          cp = src, src = function() {
            return null;
          };
        while (cp !== null || (cp = src()) !== null) {
          if (cp < 128)
            dst(cp & 127);
          else if (cp < 2048)
            dst(cp >> 6 & 31 | 192), dst(cp & 63 | 128);
          else if (cp < 65536)
            dst(cp >> 12 & 15 | 224), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
          else
            dst(cp >> 18 & 7 | 240), dst(cp >> 12 & 63 | 128), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
          cp = null;
        }
      };
      utfx2.decodeUTF8 = function(src, dst) {
        var a, b, c, d, fail = function(b2) {
          b2 = b2.slice(0, b2.indexOf(null));
          var err = Error(b2.toString());
          err.name = "TruncatedError";
          err["bytes"] = b2;
          throw err;
        };
        while ((a = src()) !== null) {
          if ((a & 128) === 0)
            dst(a);
          else if ((a & 224) === 192)
            (b = src()) === null && fail([a, b]), dst((a & 31) << 6 | b & 63);
          else if ((a & 240) === 224)
            ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst((a & 15) << 12 | (b & 63) << 6 | c & 63);
          else if ((a & 248) === 240)
            ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst((a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63);
          else throw RangeError("Illegal starting byte: " + a);
        }
      };
      utfx2.UTF16toUTF8 = function(src, dst) {
        var c1, c2 = null;
        while (true) {
          if ((c1 = c2 !== null ? c2 : src()) === null)
            break;
          if (c1 >= 55296 && c1 <= 57343) {
            if ((c2 = src()) !== null) {
              if (c2 >= 56320 && c2 <= 57343) {
                dst((c1 - 55296) * 1024 + c2 - 56320 + 65536);
                c2 = null;
                continue;
              }
            }
          }
          dst(c1);
        }
        if (c2 !== null) dst(c2);
      };
      utfx2.UTF8toUTF16 = function(src, dst) {
        var cp = null;
        if (typeof src === "number")
          cp = src, src = function() {
            return null;
          };
        while (cp !== null || (cp = src()) !== null) {
          if (cp <= 65535)
            dst(cp);
          else
            cp -= 65536, dst((cp >> 10) + 55296), dst(cp % 1024 + 56320);
          cp = null;
        }
      };
      utfx2.encodeUTF16toUTF8 = function(src, dst) {
        utfx2.UTF16toUTF8(src, function(cp) {
          utfx2.encodeUTF8(cp, dst);
        });
      };
      utfx2.decodeUTF8toUTF16 = function(src, dst) {
        utfx2.decodeUTF8(src, function(cp) {
          utfx2.UTF8toUTF16(cp, dst);
        });
      };
      utfx2.calculateCodePoint = function(cp) {
        return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
      };
      utfx2.calculateUTF8 = function(src) {
        var cp, l = 0;
        while ((cp = src()) !== null)
          l += utfx2.calculateCodePoint(cp);
        return l;
      };
      utfx2.calculateUTF16asUTF8 = function(src) {
        var n = 0, l = 0;
        utfx2.UTF16toUTF8(src, function(cp) {
          ++n;
          l += utfx2.calculateCodePoint(cp);
        });
        return [n, l];
      };
      return utfx2;
    }();
    Date.now = Date.now || function() {
      return +/* @__PURE__ */ new Date();
    };
    var BCRYPT_SALT_LEN = 16;
    var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
    var BLOWFISH_NUM_ROUNDS = 16;
    var MAX_EXECUTION_TIME = 100;
    var P_ORIG = [
      608135816,
      2242054355,
      320440878,
      57701188,
      2752067618,
      698298832,
      137296536,
      3964562569,
      1160258022,
      953160567,
      3193202383,
      887688300,
      3232508343,
      3380367581,
      1065670069,
      3041331479,
      2450970073,
      2306472731
    ];
    var S_ORIG = [
      3509652390,
      2564797868,
      805139163,
      3491422135,
      3101798381,
      1780907670,
      3128725573,
      4046225305,
      614570311,
      3012652279,
      134345442,
      2240740374,
      1667834072,
      1901547113,
      2757295779,
      4103290238,
      227898511,
      1921955416,
      1904987480,
      2182433518,
      2069144605,
      3260701109,
      2620446009,
      720527379,
      3318853667,
      677414384,
      3393288472,
      3101374703,
      2390351024,
      1614419982,
      1822297739,
      2954791486,
      3608508353,
      3174124327,
      2024746970,
      1432378464,
      3864339955,
      2857741204,
      1464375394,
      1676153920,
      1439316330,
      715854006,
      3033291828,
      289532110,
      2706671279,
      2087905683,
      3018724369,
      1668267050,
      732546397,
      1947742710,
      3462151702,
      2609353502,
      2950085171,
      1814351708,
      2050118529,
      680887927,
      999245976,
      1800124847,
      3300911131,
      1713906067,
      1641548236,
      4213287313,
      1216130144,
      1575780402,
      4018429277,
      3917837745,
      3693486850,
      3949271944,
      596196993,
      3549867205,
      258830323,
      2213823033,
      772490370,
      2760122372,
      1774776394,
      2652871518,
      566650946,
      4142492826,
      1728879713,
      2882767088,
      1783734482,
      3629395816,
      2517608232,
      2874225571,
      1861159788,
      326777828,
      3124490320,
      2130389656,
      2716951837,
      967770486,
      1724537150,
      2185432712,
      2364442137,
      1164943284,
      2105845187,
      998989502,
      3765401048,
      2244026483,
      1075463327,
      1455516326,
      1322494562,
      910128902,
      469688178,
      1117454909,
      936433444,
      3490320968,
      3675253459,
      1240580251,
      122909385,
      2157517691,
      634681816,
      4142456567,
      3825094682,
      3061402683,
      2540495037,
      79693498,
      3249098678,
      1084186820,
      1583128258,
      426386531,
      1761308591,
      1047286709,
      322548459,
      995290223,
      1845252383,
      2603652396,
      3431023940,
      2942221577,
      3202600964,
      3727903485,
      1712269319,
      422464435,
      3234572375,
      1170764815,
      3523960633,
      3117677531,
      1434042557,
      442511882,
      3600875718,
      1076654713,
      1738483198,
      4213154764,
      2393238008,
      3677496056,
      1014306527,
      4251020053,
      793779912,
      2902807211,
      842905082,
      4246964064,
      1395751752,
      1040244610,
      2656851899,
      3396308128,
      445077038,
      3742853595,
      3577915638,
      679411651,
      2892444358,
      2354009459,
      1767581616,
      3150600392,
      3791627101,
      3102740896,
      284835224,
      4246832056,
      1258075500,
      768725851,
      2589189241,
      3069724005,
      3532540348,
      1274779536,
      3789419226,
      2764799539,
      1660621633,
      3471099624,
      4011903706,
      913787905,
      3497959166,
      737222580,
      2514213453,
      2928710040,
      3937242737,
      1804850592,
      3499020752,
      2949064160,
      2386320175,
      2390070455,
      2415321851,
      4061277028,
      2290661394,
      2416832540,
      1336762016,
      1754252060,
      3520065937,
      3014181293,
      791618072,
      3188594551,
      3933548030,
      2332172193,
      3852520463,
      3043980520,
      413987798,
      3465142937,
      3030929376,
      4245938359,
      2093235073,
      3534596313,
      375366246,
      2157278981,
      2479649556,
      555357303,
      3870105701,
      2008414854,
      3344188149,
      4221384143,
      3956125452,
      2067696032,
      3594591187,
      2921233993,
      2428461,
      544322398,
      577241275,
      1471733935,
      610547355,
      4027169054,
      1432588573,
      1507829418,
      2025931657,
      3646575487,
      545086370,
      48609733,
      2200306550,
      1653985193,
      298326376,
      1316178497,
      3007786442,
      2064951626,
      458293330,
      2589141269,
      3591329599,
      3164325604,
      727753846,
      2179363840,
      146436021,
      1461446943,
      4069977195,
      705550613,
      3059967265,
      3887724982,
      4281599278,
      3313849956,
      1404054877,
      2845806497,
      146425753,
      1854211946,
      1266315497,
      3048417604,
      3681880366,
      3289982499,
      290971e4,
      1235738493,
      2632868024,
      2414719590,
      3970600049,
      1771706367,
      1449415276,
      3266420449,
      422970021,
      1963543593,
      2690192192,
      3826793022,
      1062508698,
      1531092325,
      1804592342,
      2583117782,
      2714934279,
      4024971509,
      1294809318,
      4028980673,
      1289560198,
      2221992742,
      1669523910,
      35572830,
      157838143,
      1052438473,
      1016535060,
      1802137761,
      1753167236,
      1386275462,
      3080475397,
      2857371447,
      1040679964,
      2145300060,
      2390574316,
      1461121720,
      2956646967,
      4031777805,
      4028374788,
      33600511,
      2920084762,
      1018524850,
      629373528,
      3691585981,
      3515945977,
      2091462646,
      2486323059,
      586499841,
      988145025,
      935516892,
      3367335476,
      2599673255,
      2839830854,
      265290510,
      3972581182,
      2759138881,
      3795373465,
      1005194799,
      847297441,
      406762289,
      1314163512,
      1332590856,
      1866599683,
      4127851711,
      750260880,
      613907577,
      1450815602,
      3165620655,
      3734664991,
      3650291728,
      3012275730,
      3704569646,
      1427272223,
      778793252,
      1343938022,
      2676280711,
      2052605720,
      1946737175,
      3164576444,
      3914038668,
      3967478842,
      3682934266,
      1661551462,
      3294938066,
      4011595847,
      840292616,
      3712170807,
      616741398,
      312560963,
      711312465,
      1351876610,
      322626781,
      1910503582,
      271666773,
      2175563734,
      1594956187,
      70604529,
      3617834859,
      1007753275,
      1495573769,
      4069517037,
      2549218298,
      2663038764,
      504708206,
      2263041392,
      3941167025,
      2249088522,
      1514023603,
      1998579484,
      1312622330,
      694541497,
      2582060303,
      2151582166,
      1382467621,
      776784248,
      2618340202,
      3323268794,
      2497899128,
      2784771155,
      503983604,
      4076293799,
      907881277,
      423175695,
      432175456,
      1378068232,
      4145222326,
      3954048622,
      3938656102,
      3820766613,
      2793130115,
      2977904593,
      26017576,
      3274890735,
      3194772133,
      1700274565,
      1756076034,
      4006520079,
      3677328699,
      720338349,
      1533947780,
      354530856,
      688349552,
      3973924725,
      1637815568,
      332179504,
      3949051286,
      53804574,
      2852348879,
      3044236432,
      1282449977,
      3583942155,
      3416972820,
      4006381244,
      1617046695,
      2628476075,
      3002303598,
      1686838959,
      431878346,
      2686675385,
      1700445008,
      1080580658,
      1009431731,
      832498133,
      3223435511,
      2605976345,
      2271191193,
      2516031870,
      1648197032,
      4164389018,
      2548247927,
      300782431,
      375919233,
      238389289,
      3353747414,
      2531188641,
      2019080857,
      1475708069,
      455242339,
      2609103871,
      448939670,
      3451063019,
      1395535956,
      2413381860,
      1841049896,
      1491858159,
      885456874,
      4264095073,
      4001119347,
      1565136089,
      3898914787,
      1108368660,
      540939232,
      1173283510,
      2745871338,
      3681308437,
      4207628240,
      3343053890,
      4016749493,
      1699691293,
      1103962373,
      3625875870,
      2256883143,
      3830138730,
      1031889488,
      3479347698,
      1535977030,
      4236805024,
      3251091107,
      2132092099,
      1774941330,
      1199868427,
      1452454533,
      157007616,
      2904115357,
      342012276,
      595725824,
      1480756522,
      206960106,
      497939518,
      591360097,
      863170706,
      2375253569,
      3596610801,
      1814182875,
      2094937945,
      3421402208,
      1082520231,
      3463918190,
      2785509508,
      435703966,
      3908032597,
      1641649973,
      2842273706,
      3305899714,
      1510255612,
      2148256476,
      2655287854,
      3276092548,
      4258621189,
      236887753,
      3681803219,
      274041037,
      1734335097,
      3815195456,
      3317970021,
      1899903192,
      1026095262,
      4050517792,
      356393447,
      2410691914,
      3873677099,
      3682840055,
      3913112168,
      2491498743,
      4132185628,
      2489919796,
      1091903735,
      1979897079,
      3170134830,
      3567386728,
      3557303409,
      857797738,
      1136121015,
      1342202287,
      507115054,
      2535736646,
      337727348,
      3213592640,
      1301675037,
      2528481711,
      1895095763,
      1721773893,
      3216771564,
      62756741,
      2142006736,
      835421444,
      2531993523,
      1442658625,
      3659876326,
      2882144922,
      676362277,
      1392781812,
      170690266,
      3921047035,
      1759253602,
      3611846912,
      1745797284,
      664899054,
      1329594018,
      3901205900,
      3045908486,
      2062866102,
      2865634940,
      3543621612,
      3464012697,
      1080764994,
      553557557,
      3656615353,
      3996768171,
      991055499,
      499776247,
      1265440854,
      648242737,
      3940784050,
      980351604,
      3713745714,
      1749149687,
      3396870395,
      4211799374,
      3640570775,
      1161844396,
      3125318951,
      1431517754,
      545492359,
      4268468663,
      3499529547,
      1437099964,
      2702547544,
      3433638243,
      2581715763,
      2787789398,
      1060185593,
      1593081372,
      2418618748,
      4260947970,
      69676912,
      2159744348,
      86519011,
      2512459080,
      3838209314,
      1220612927,
      3339683548,
      133810670,
      1090789135,
      1078426020,
      1569222167,
      845107691,
      3583754449,
      4072456591,
      1091646820,
      628848692,
      1613405280,
      3757631651,
      526609435,
      236106946,
      48312990,
      2942717905,
      3402727701,
      1797494240,
      859738849,
      992217954,
      4005476642,
      2243076622,
      3870952857,
      3732016268,
      765654824,
      3490871365,
      2511836413,
      1685915746,
      3888969200,
      1414112111,
      2273134842,
      3281911079,
      4080962846,
      172450625,
      2569994100,
      980381355,
      4109958455,
      2819808352,
      2716589560,
      2568741196,
      3681446669,
      3329971472,
      1835478071,
      660984891,
      3704678404,
      4045999559,
      3422617507,
      3040415634,
      1762651403,
      1719377915,
      3470491036,
      2693910283,
      3642056355,
      3138596744,
      1364962596,
      2073328063,
      1983633131,
      926494387,
      3423689081,
      2150032023,
      4096667949,
      1749200295,
      3328846651,
      309677260,
      2016342300,
      1779581495,
      3079819751,
      111262694,
      1274766160,
      443224088,
      298511866,
      1025883608,
      3806446537,
      1145181785,
      168956806,
      3641502830,
      3584813610,
      1689216846,
      3666258015,
      3200248200,
      1692713982,
      2646376535,
      4042768518,
      1618508792,
      1610833997,
      3523052358,
      4130873264,
      2001055236,
      3610705100,
      2202168115,
      4028541809,
      2961195399,
      1006657119,
      2006996926,
      3186142756,
      1430667929,
      3210227297,
      1314452623,
      4074634658,
      4101304120,
      2273951170,
      1399257539,
      3367210612,
      3027628629,
      1190975929,
      2062231137,
      2333990788,
      2221543033,
      2438960610,
      1181637006,
      548689776,
      2362791313,
      3372408396,
      3104550113,
      3145860560,
      296247880,
      1970579870,
      3078560182,
      3769228297,
      1714227617,
      3291629107,
      3898220290,
      166772364,
      1251581989,
      493813264,
      448347421,
      195405023,
      2709975567,
      677966185,
      3703036547,
      1463355134,
      2715995803,
      1338867538,
      1343315457,
      2802222074,
      2684532164,
      233230375,
      2599980071,
      2000651841,
      3277868038,
      1638401717,
      4028070440,
      3237316320,
      6314154,
      819756386,
      300326615,
      590932579,
      1405279636,
      3267499572,
      3150704214,
      2428286686,
      3959192993,
      3461946742,
      1862657033,
      1266418056,
      963775037,
      2089974820,
      2263052895,
      1917689273,
      448879540,
      3550394620,
      3981727096,
      150775221,
      3627908307,
      1303187396,
      508620638,
      2975983352,
      2726630617,
      1817252668,
      1876281319,
      1457606340,
      908771278,
      3720792119,
      3617206836,
      2455994898,
      1729034894,
      1080033504,
      976866871,
      3556439503,
      2881648439,
      1522871579,
      1555064734,
      1336096578,
      3548522304,
      2579274686,
      3574697629,
      3205460757,
      3593280638,
      3338716283,
      3079412587,
      564236357,
      2993598910,
      1781952180,
      1464380207,
      3163844217,
      3332601554,
      1699332808,
      1393555694,
      1183702653,
      3581086237,
      1288719814,
      691649499,
      2847557200,
      2895455976,
      3193889540,
      2717570544,
      1781354906,
      1676643554,
      2592534050,
      3230253752,
      1126444790,
      2770207658,
      2633158820,
      2210423226,
      2615765581,
      2414155088,
      3127139286,
      673620729,
      2805611233,
      1269405062,
      4015350505,
      3341807571,
      4149409754,
      1057255273,
      2012875353,
      2162469141,
      2276492801,
      2601117357,
      993977747,
      3918593370,
      2654263191,
      753973209,
      36408145,
      2530585658,
      25011837,
      3520020182,
      2088578344,
      530523599,
      2918365339,
      1524020338,
      1518925132,
      3760827505,
      3759777254,
      1202760957,
      3985898139,
      3906192525,
      674977740,
      4174734889,
      2031300136,
      2019492241,
      3983892565,
      4153806404,
      3822280332,
      352677332,
      2297720250,
      60907813,
      90501309,
      3286998549,
      1016092578,
      2535922412,
      2839152426,
      457141659,
      509813237,
      4120667899,
      652014361,
      1966332200,
      2975202805,
      55981186,
      2327461051,
      676427537,
      3255491064,
      2882294119,
      3433927263,
      1307055953,
      942726286,
      933058658,
      2468411793,
      3933900994,
      4215176142,
      1361170020,
      2001714738,
      2830558078,
      3274259782,
      1222529897,
      1679025792,
      2729314320,
      3714953764,
      1770335741,
      151462246,
      3013232138,
      1682292957,
      1483529935,
      471910574,
      1539241949,
      458788160,
      3436315007,
      1807016891,
      3718408830,
      978976581,
      1043663428,
      3165965781,
      1927990952,
      4200891579,
      2372276910,
      3208408903,
      3533431907,
      1412390302,
      2931980059,
      4132332400,
      1947078029,
      3881505623,
      4168226417,
      2941484381,
      1077988104,
      1320477388,
      886195818,
      18198404,
      3786409e3,
      2509781533,
      112762804,
      3463356488,
      1866414978,
      891333506,
      18488651,
      661792760,
      1628790961,
      3885187036,
      3141171499,
      876946877,
      2693282273,
      1372485963,
      791857591,
      2686433993,
      3759982718,
      3167212022,
      3472953795,
      2716379847,
      445679433,
      3561995674,
      3504004811,
      3574258232,
      54117162,
      3331405415,
      2381918588,
      3769707343,
      4154350007,
      1140177722,
      4074052095,
      668550556,
      3214352940,
      367459370,
      261225585,
      2610173221,
      4209349473,
      3468074219,
      3265815641,
      314222801,
      3066103646,
      3808782860,
      282218597,
      3406013506,
      3773591054,
      379116347,
      1285071038,
      846784868,
      2669647154,
      3771962079,
      3550491691,
      2305946142,
      453669953,
      1268987020,
      3317592352,
      3279303384,
      3744833421,
      2610507566,
      3859509063,
      266596637,
      3847019092,
      517658769,
      3462560207,
      3443424879,
      370717030,
      4247526661,
      2224018117,
      4143653529,
      4112773975,
      2788324899,
      2477274417,
      1456262402,
      2901442914,
      1517677493,
      1846949527,
      2295493580,
      3734397586,
      2176403920,
      1280348187,
      1908823572,
      3871786941,
      846861322,
      1172426758,
      3287448474,
      3383383037,
      1655181056,
      3139813346,
      901632758,
      1897031941,
      2986607138,
      3066810236,
      3447102507,
      1393639104,
      373351379,
      950779232,
      625454576,
      3124240540,
      4148612726,
      2007998917,
      544563296,
      2244738638,
      2330496472,
      2058025392,
      1291430526,
      424198748,
      50039436,
      29584100,
      3605783033,
      2429876329,
      2791104160,
      1057563949,
      3255363231,
      3075367218,
      3463963227,
      1469046755,
      985887462
    ];
    var C_ORIG = [
      1332899944,
      1700884034,
      1701343084,
      1684370003,
      1668446532,
      1869963892
    ];
    function _encipher(lr, off, P, S) {
      var n, l = lr[off], r = lr[off + 1];
      l ^= P[0];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[1];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[2];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[3];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[4];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[5];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[6];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[7];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[8];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[9];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[10];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[11];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[12];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[13];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[14];
      n = S[l >>> 24];
      n += S[256 | l >> 16 & 255];
      n ^= S[512 | l >> 8 & 255];
      n += S[768 | l & 255];
      r ^= n ^ P[15];
      n = S[r >>> 24];
      n += S[256 | r >> 16 & 255];
      n ^= S[512 | r >> 8 & 255];
      n += S[768 | r & 255];
      l ^= n ^ P[16];
      lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
      lr[off + 1] = l;
      return lr;
    }
    function _streamtoword(data, offp) {
      for (var i = 0, word = 0; i < 4; ++i)
        word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
      return { key: word, offp };
    }
    function _key(key, P, S) {
      var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
      for (var i = 0; i < plen; i++)
        sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
      for (i = 0; i < plen; i += 2)
        lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
      for (i = 0; i < slen; i += 2)
        lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
    }
    function _ekskey(data, key, P, S) {
      var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
      for (var i = 0; i < plen; i++)
        sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
      offp = 0;
      for (i = 0; i < plen; i += 2)
        sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
      for (i = 0; i < slen; i += 2)
        sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
    }
    function _crypt(b, salt, rounds, callback, progressCallback) {
      var cdata = C_ORIG.slice(), clen = cdata.length, err;
      if (rounds < 4 || rounds > 31) {
        err = Error("Illegal number of rounds (4-31): " + rounds);
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else
          throw err;
      }
      if (salt.length !== BCRYPT_SALT_LEN) {
        err = Error("Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN);
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else
          throw err;
      }
      rounds = 1 << rounds >>> 0;
      var P, S, i = 0, j;
      if (Int32Array) {
        P = new Int32Array(P_ORIG);
        S = new Int32Array(S_ORIG);
      } else {
        P = P_ORIG.slice();
        S = S_ORIG.slice();
      }
      _ekskey(salt, b, P, S);
      function next() {
        if (progressCallback)
          progressCallback(i / rounds);
        if (i < rounds) {
          var start = Date.now();
          for (; i < rounds; ) {
            i = i + 1;
            _key(b, P, S);
            _key(salt, P, S);
            if (Date.now() - start > MAX_EXECUTION_TIME)
              break;
          }
        } else {
          for (i = 0; i < 64; i++)
            for (j = 0; j < clen >> 1; j++)
              _encipher(cdata, j << 1, P, S);
          var ret = [];
          for (i = 0; i < clen; i++)
            ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
          if (callback) {
            callback(null, ret);
            return;
          } else
            return ret;
        }
        if (callback)
          nextTick(next);
      }
      if (typeof callback !== "undefined") {
        next();
      } else {
        var res;
        while (true)
          if (typeof (res = next()) !== "undefined")
            return res || [];
      }
    }
    function _hash(s, salt, callback, progressCallback) {
      var err;
      if (typeof s !== "string" || typeof salt !== "string") {
        err = Error("Invalid string / salt: Not a string");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else
          throw err;
      }
      var minor, offset;
      if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
        err = Error("Invalid salt version: " + salt.substring(0, 2));
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else
          throw err;
      }
      if (salt.charAt(2) === "$")
        minor = String.fromCharCode(0), offset = 3;
      else {
        minor = salt.charAt(2);
        if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
          err = Error("Invalid salt revision: " + salt.substring(2, 4));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        offset = 4;
      }
      if (salt.charAt(offset + 2) > "$") {
        err = Error("Missing salt rounds");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else
          throw err;
      }
      var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
      s += minor >= "a" ? "\0" : "";
      var passwordb = stringToBytes(s), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
      function finish(bytes) {
        var res = [];
        res.push("$2");
        if (minor >= "a")
          res.push(minor);
        res.push("$");
        if (rounds < 10)
          res.push("0");
        res.push(rounds.toString());
        res.push("$");
        res.push(base64_encode(saltb, saltb.length));
        res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
        return res.join("");
      }
      if (typeof callback == "undefined")
        return finish(_crypt(passwordb, saltb, rounds));
      else {
        _crypt(passwordb, saltb, rounds, function(err2, bytes) {
          if (err2)
            callback(err2, null);
          else
            callback(null, finish(bytes));
        }, progressCallback);
      }
    }
    bcrypt2.encodeBase64 = base64_encode;
    bcrypt2.decodeBase64 = base64_decode;
    return bcrypt2;
  });
})(bcrypt$1);
var bcryptExports = bcrypt$1.exports;
var bcryptjs = bcryptExports;
const bcrypt = /* @__PURE__ */ getDefaultExportFromCjs(bcryptjs);
let getRandomValues;
const rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}
const randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
const native = {
  randomUUID
};
function v4(options, buf, offset) {
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
let currentUserId = null;
const login = async (data) => {
  const db2 = getDb();
  const user = db2.prepare(`
    SELECT id, username, password_hash, email, avatar, nickname, created_at, updated_at
    FROM users
    WHERE username = ?
  `).get(data.account);
  if (!user) {
    throw new Error("User not found");
  }
  const isPasswordValid = bcrypt.compareSync(data.password, user.password_hash);
  if (!isPasswordValid) {
    throw new Error("Invalid password");
  }
  const token = `desktop_${v4()}_${Date.now()}`;
  currentUserId = user.id;
  return {
    accessToken: token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      nickname: user.nickname,
      created_at: user.created_at,
      updated_at: user.updated_at
    }
  };
};
const register = async (data) => {
  const db2 = getDb();
  const existingUser = db2.prepare("SELECT id FROM users WHERE username = ?").get(data.username);
  if (existingUser) {
    throw new Error("Username already exists");
  }
  const userId = v4();
  const passwordHash = bcrypt.hashSync(data.password, 10);
  db2.prepare(`
    INSERT INTO users (id, username, password_hash, email, nickname)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, data.username, passwordHash, data.email || null, data.username);
  const spaceId = v4();
  db2.prepare(`
    INSERT INTO spaces (id, name, description, owner_id, is_personal)
    VALUES (?, ?, ?, ?, ?)
  `).run(spaceId, "Personal Space", "Your personal workspace", userId, 1);
  db2.prepare(`
    INSERT INTO space_members (id, space_id, user_id, role)
    VALUES (?, ?, ?, ?)
  `).run(v4(), spaceId, userId, "owner");
  const pageId = v4();
  db2.prepare(`
    INSERT INTO pages (id, space_id, title, content, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(pageId, spaceId, "Welcome", JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Welcome!" }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Start creating your knowledge base." }]
      }
    ]
  }), userId);
  db2.prepare(`UPDATE spaces SET home_page_id = ? WHERE id = ?`).run(pageId, spaceId);
  const user = db2.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId);
  return user;
};
const getCurrentUserId = () => {
  return currentUserId;
};
const logout = () => {
  currentUserId = null;
};
const registerAuthIpcHandlers = () => {
  electron.ipcMain.handle("auth:login", async (_event, data) => {
    try {
      const result = await login(data);
      return createResponse(result);
    } catch (error) {
      return createErrorResponse(error.message, 401);
    }
  });
  electron.ipcMain.handle("auth:register", async (_event, data) => {
    try {
      const user = await register(data);
      return createResponse(user);
    } catch (error) {
      return createErrorResponse(error.message, 400);
    }
  });
  electron.ipcMain.handle("auth:logout", async () => {
    logout();
    return createResponse(null, true, "Logged out successfully");
  });
};
const getUserInfo = async () => {
  const userId = getCurrentUserId();
  if (!userId) {
    return null;
  }
  const db2 = getDb();
  const user = db2.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId);
  return user || null;
};
const getUserById = async (id) => {
  const db2 = getDb();
  const user = db2.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(id);
  return user || null;
};
const searchUsers = async (query) => {
  const db2 = getDb();
  const searchPattern = `%${query}%`;
  const users = db2.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users
    WHERE username LIKE ? OR email LIKE ? OR nickname LIKE ?
    LIMIT 20
  `).all(searchPattern, searchPattern, searchPattern);
  return users;
};
const updateProfile = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Not logged in");
  }
  const db2 = getDb();
  const updates = [];
  const values = [];
  if (data.nickname !== void 0) {
    updates.push("nickname = ?");
    values.push(data.nickname);
  }
  if (data.email !== void 0) {
    updates.push("email = ?");
    values.push(data.email);
  }
  if (data.avatar !== void 0) {
    updates.push("avatar = ?");
    values.push(data.avatar);
  }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(userId);
    db2.prepare(`
      UPDATE users SET ${updates.join(", ")} WHERE id = ?
    `).run(...values);
  }
  return getUserInfo();
};
const registerUserIpcHandlers = () => {
  electron.ipcMain.handle("user:getInfo", async () => {
    try {
      const user = await getUserInfo();
      if (!user) {
        return createErrorResponse("Not logged in", 401);
      }
      return createResponse(user);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("user:search", async (_event, query) => {
    try {
      const users = await searchUsers(query);
      return createResponse(users);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("user:updateProfile", async (_event, data) => {
    try {
      const user = await updateProfile(data);
      return createResponse(user);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("user:getById", async (_event, id) => {
    try {
      const user = await getUserById(id);
      return createResponse(user);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const listSpaces = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const spaces = db2.prepare(`
    SELECT DISTINCT s.* FROM spaces s
    LEFT JOIN space_members sm ON s.id = sm.space_id
    WHERE s.owner_id = ? OR sm.user_id = ?
    ORDER BY s.created_at DESC
  `).all(userId, userId);
  return spaces;
};
const getPersonalSpace = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const space = db2.prepare(`
    SELECT * FROM spaces WHERE owner_id = ? AND is_personal = 1
  `).get(userId);
  return space || null;
};
const getSpaceDetail = async (id) => {
  const db2 = getDb();
  const space = db2.prepare(`
    SELECT * FROM spaces WHERE id = ?
  `).get(id);
  return space || null;
};
const createSpace = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const spaceId = v4();
  db2.prepare(`
    INSERT INTO spaces (id, name, description, icon, cover, owner_id, is_personal)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(spaceId, data.name, data.description || null, data.icon || null, data.cover || null, userId);
  db2.prepare(`
    INSERT INTO space_members (id, space_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `).run(v4(), spaceId, userId);
  const space = db2.prepare(`SELECT * FROM spaces WHERE id = ?`).get(spaceId);
  return space;
};
const updateSpace = async (id, data) => {
  const db2 = getDb();
  const updates = [];
  const values = [];
  if (data.name !== void 0) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.description !== void 0) {
    updates.push("description = ?");
    values.push(data.description);
  }
  if (data.icon !== void 0) {
    updates.push("icon = ?");
    values.push(data.icon);
  }
  if (data.cover !== void 0) {
    updates.push("cover = ?");
    values.push(data.cover);
  }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db2.prepare(`UPDATE spaces SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  return getSpaceDetail(id);
};
const deleteSpace = async (id) => {
  const db2 = getDb();
  db2.prepare(`DELETE FROM pages WHERE space_id = ?`).run(id);
  db2.prepare(`DELETE FROM space_members WHERE space_id = ?`).run(id);
  db2.prepare(`DELETE FROM favorites WHERE space_id = ?`).run(id);
  db2.prepare(`DELETE FROM spaces WHERE id = ?`).run(id);
};
const addSpaceFavorite = async (spaceId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const existing = db2.prepare(`
    SELECT id FROM favorites WHERE user_id = ? AND space_id = ?
  `).get(userId, spaceId);
  if (!existing) {
    db2.prepare(`
      INSERT INTO favorites (id, user_id, space_id)
      VALUES (?, ?, ?)
    `).run(v4(), userId, spaceId);
  }
};
const removeSpaceFavorite = async (spaceId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  db2.prepare(`DELETE FROM favorites WHERE user_id = ? AND space_id = ?`).run(userId, spaceId);
};
const getSpaceMembers = async (spaceId) => {
  const db2 = getDb();
  const members = db2.prepare(`
    SELECT u.id, u.username, u.email, u.avatar, u.nickname, sm.role, sm.joined_at
    FROM space_members sm
    JOIN users u ON sm.user_id = u.id
    WHERE sm.space_id = ?
  `).all(spaceId);
  return members;
};
const saveSpaceAsTemplate = async (spaceId) => {
  const db2 = getDb();
  db2.prepare(`UPDATE pages SET is_template = 1 WHERE space_id = ?`).run(spaceId);
};
const registerSpaceIpcHandlers = () => {
  electron.ipcMain.handle("space:list", async () => {
    try {
      const spaces = await listSpaces();
      return createResponse({ records: spaces, total: spaces.length });
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:getPersonal", async () => {
    try {
      const space = await getPersonalSpace();
      return createResponse(space);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:getDetail", async (_event, id) => {
    try {
      const space = await getSpaceDetail(id);
      return createResponse(space);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:create", async (_event, data) => {
    try {
      const space = await createSpace(data);
      return createResponse(space);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:update", async (_event, { id, data }) => {
    try {
      const space = await updateSpace(id, data);
      return createResponse(space);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:delete", async (_event, id) => {
    try {
      await deleteSpace(id);
      return createResponse(null, true, "Space deleted successfully");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:addFavorite", async (_event, id) => {
    try {
      await addSpaceFavorite(id);
      return createResponse(null, true, "Added to favorites");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:removeFavorite", async (_event, id) => {
    try {
      await removeSpaceFavorite(id);
      return createResponse(null, true, "Removed from favorites");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:getMembers", async (_event, id) => {
    try {
      const members = await getSpaceMembers(id);
      return createResponse(members);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("space:saveAsTemplate", async (_event, id) => {
    try {
      await saveSpaceAsTemplate(id);
      return createResponse(null, true, "Saved as template");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const getPageTree = async (spaceId, searchValue) => {
  const db2 = getDb();
  let query = `
    SELECT * FROM pages 
    WHERE space_id = ? AND status = 'active'
  `;
  const params = [spaceId];
  if (searchValue) {
    query += ` AND title LIKE ?`;
    params.push(`%${searchValue}%`);
  }
  query += ` ORDER BY sort_order ASC, created_at ASC`;
  const pages = db2.prepare(query).all(...params);
  const buildTree = (parentId) => {
    return pages.filter((p) => p.parent_id === parentId).map((page) => ({
      ...page,
      children: buildTree(page.id)
    }));
  };
  return buildTree(null);
};
const getPageContent = async (id) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const page = db2.prepare(`SELECT * FROM pages WHERE id = ?`).get(id);
  if (page) {
    const existing = db2.prepare(`
      SELECT id FROM recent_pages WHERE user_id = ? AND page_id = ?
    `).get(userId, id);
    if (existing) {
      db2.prepare(`
        UPDATE recent_pages SET viewed_at = datetime('now') WHERE user_id = ? AND page_id = ?
      `).run(userId, id);
    } else {
      db2.prepare(`
        INSERT INTO recent_pages (id, user_id, page_id) VALUES (?, ?, ?)
      `).run(v4(), userId, id);
    }
  }
  return page || null;
};
const createPage = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const pageId = v4();
  db2.prepare(`
    INSERT INTO pages (id, space_id, parent_id, title, content, icon, cover, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pageId,
    data.spaceId,
    data.parentId || null,
    data.title || "Untitled",
    data.content || null,
    data.icon || null,
    data.cover || null,
    userId
  );
  const page = db2.prepare(`SELECT * FROM pages WHERE id = ?`).get(pageId);
  return page;
};
const savePage = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  if (data.id) {
    const updates = [];
    const values = [];
    if (data.title !== void 0) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.content !== void 0) {
      updates.push("content = ?");
      values.push(data.content);
    }
    if (data.icon !== void 0) {
      updates.push("icon = ?");
      values.push(data.icon);
    }
    if (data.cover !== void 0) {
      updates.push("cover = ?");
      values.push(data.cover);
    }
    if (data.parentId !== void 0) {
      updates.push("parent_id = ?");
      values.push(data.parentId || null);
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(data.id);
      db2.prepare(`UPDATE pages SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }
    return db2.prepare(`SELECT * FROM pages WHERE id = ?`).get(data.id);
  } else {
    return createPage(data);
  }
};
const moveToTrash = async (id) => {
  const db2 = getDb();
  db2.prepare(`UPDATE pages SET status = 'trash', updated_at = datetime('now') WHERE id = ?`).run(id);
};
const restorePage = async (id) => {
  const db2 = getDb();
  db2.prepare(`UPDATE pages SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(id);
};
const listPages = async (params) => {
  const db2 = getDb();
  let query = `SELECT * FROM pages WHERE 1=1`;
  const queryParams = [];
  if (params.spaceId) {
    query += ` AND space_id = ?`;
    queryParams.push(params.spaceId);
  }
  if (params.status) {
    query += ` AND status = ?`;
    queryParams.push(params.status);
  }
  query += ` ORDER BY updated_at DESC`;
  const pages = db2.prepare(query).all(...queryParams);
  return { records: pages, total: pages.length };
};
const getFavoritePages = async (params) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  let query = `
    SELECT p.*, f.created_at as favorited_at
    FROM favorites f
    JOIN pages p ON f.page_id = p.id
    WHERE f.user_id = ? AND f.page_id IS NOT NULL
  `;
  const queryParams = [userId];
  if (params.scope) {
    query += ` AND p.space_id = ?`;
    queryParams.push(params.scope);
  }
  query += ` ORDER BY f.created_at DESC`;
  if (params.pageSize) {
    query += ` LIMIT ?`;
    queryParams.push(params.pageSize);
  }
  const favorites = db2.prepare(query).all(...queryParams);
  return { records: favorites, total: favorites.length };
};
const getRecentPages = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const pages = db2.prepare(`
    SELECT p.* FROM recent_pages rp
    JOIN pages p ON rp.page_id = p.id
    WHERE rp.user_id = ? AND p.status = 'active'
    ORDER BY rp.viewed_at DESC
    LIMIT 20
  `).all(userId);
  return pages;
};
const getTemplates = async () => {
  const db2 = getDb();
  const templates = db2.prepare(`
    SELECT * FROM pages WHERE is_template = 1
    ORDER BY created_at DESC
  `).all();
  return templates;
};
const saveAsTemplate = async (id) => {
  const db2 = getDb();
  db2.prepare(`UPDATE pages SET is_template = 1 WHERE id = ?`).run(id);
};
const addPageFavorite = async (pageId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const existing = db2.prepare(`
    SELECT id FROM favorites WHERE user_id = ? AND page_id = ?
  `).get(userId, pageId);
  if (!existing) {
    db2.prepare(`
      INSERT INTO favorites (id, user_id, page_id) VALUES (?, ?, ?)
    `).run(v4(), userId, pageId);
  }
};
const removePageFavorite = async (favoriteId) => {
  const db2 = getDb();
  db2.prepare(`DELETE FROM favorites WHERE id = ?`).run(favoriteId);
};
const queryBlocks = async (params) => {
  const db2 = getDb();
  let query = `SELECT * FROM pages WHERE status = 'active'`;
  const queryParams = [];
  if (params.pageId) {
    query += ` AND id = ?`;
    queryParams.push(params.pageId);
  }
  if (params.pageTitle) {
    query += ` AND title LIKE ?`;
    queryParams.push(`%${params.pageTitle}%`);
  }
  if (params.spaceId) {
    query += ` AND space_id = ?`;
    queryParams.push(params.spaceId);
  }
  return db2.prepare(query).all(...queryParams);
};
const getBlockInfo = async (id) => {
  const db2 = getDb();
  const page = db2.prepare(`SELECT * FROM pages WHERE id = ?`).get(id);
  return page || null;
};
const getPageCollaborators = async (pageId) => {
  const db2 = getDb();
  const page = db2.prepare(`
    SELECT p.created_by, u.username, u.email, u.avatar, u.nickname
    FROM pages p
    JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(pageId);
  if (page) {
    return [{
      userId: page.created_by,
      username: page.username,
      email: page.email,
      avatar: page.avatar,
      nickname: page.nickname,
      permission: "owner"
    }];
  }
  return [];
};
const registerPageIpcHandlers = () => {
  electron.ipcMain.handle("page:getTree", async (_event, { spaceId, searchValue }) => {
    try {
      const tree = await getPageTree(spaceId, searchValue);
      return createResponse(tree);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getContent", async (_event, id) => {
    try {
      const page = await getPageContent(id);
      return createResponse(page);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:create", async (_event, data) => {
    try {
      const page = await createPage(data);
      return createResponse(page);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:save", async (_event, data) => {
    try {
      const page = await savePage(data);
      return createResponse(page);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:moveToTrash", async (_event, id) => {
    try {
      await moveToTrash(id);
      return createResponse(null, true, "Moved to trash");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:restore", async (_event, id) => {
    try {
      await restorePage(id);
      return createResponse(null, true, "Page restored");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:list", async (_event, params) => {
    try {
      const result = await listPages(params);
      return createResponse(result);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getFavorites", async (_event, params) => {
    try {
      const result = await getFavoritePages(params);
      return createResponse(result);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getRecent", async () => {
    try {
      const pages = await getRecentPages();
      return createResponse(pages);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getTemplates", async () => {
    try {
      const templates = await getTemplates();
      return createResponse(templates);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:saveAsTemplate", async (_event, id) => {
    try {
      await saveAsTemplate(id);
      return createResponse(null, true, "Saved as template");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:addFavorite", async (_event, id) => {
    try {
      await addPageFavorite(id);
      return createResponse(null, true, "Added to favorites");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:removeFavorite", async (_event, id) => {
    try {
      await removePageFavorite(id);
      return createResponse(null, true, "Removed from favorites");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getBlocks", async (_event, params) => {
    try {
      const blocks = await queryBlocks(params);
      return createResponse(blocks);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getBlockInfo", async (_event, id) => {
    try {
      const block = await getBlockInfo(id);
      return createResponse(block);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("page:getCollaborators", async (_event, pageId) => {
    try {
      const collaborators = await getPageCollaborators(pageId);
      return createResponse(collaborators);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const listPlugins = async () => {
  const db2 = getDb();
  const plugins = db2.prepare(`
    SELECT * FROM plugins ORDER BY is_builtin DESC, name ASC
  `).all();
  return plugins;
};
const getPlugin = async (id) => {
  const db2 = getDb();
  const plugin = db2.prepare(`SELECT * FROM plugins WHERE id = ?`).get(id);
  return plugin || null;
};
const createPlugin = async (data) => {
  const db2 = getDb();
  const pluginId = v4();
  db2.prepare(`
    INSERT INTO plugins (id, name, version, description, entry_point, icon, author, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    pluginId,
    data.name,
    data.version || "1.0.0",
    data.description || null,
    data.entryPoint || null,
    data.icon || null,
    data.author || null
  );
  return db2.prepare(`SELECT * FROM plugins WHERE id = ?`).get(pluginId);
};
const installPlugin = async (pluginId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const existing = db2.prepare(`
    SELECT id FROM user_plugins WHERE user_id = ? AND plugin_id = ?
  `).get(userId, pluginId);
  if (existing) {
    throw new Error("Plugin already installed");
  }
  db2.prepare(`
    INSERT INTO user_plugins (id, user_id, plugin_id)
    VALUES (?, ?, ?)
  `).run(v4(), userId, pluginId);
};
const uninstallPlugin = async (pluginId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const plugin = db2.prepare(`SELECT is_builtin FROM plugins WHERE id = ?`).get(pluginId);
  if (plugin == null ? void 0 : plugin.is_builtin) {
    throw new Error("Cannot uninstall builtin plugins");
  }
  db2.prepare(`
    DELETE FROM user_plugins WHERE user_id = ? AND plugin_id = ?
  `).run(userId, pluginId);
};
const getInstalledPlugins = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const plugins = db2.prepare(`
    SELECT p.* FROM plugins p
    JOIN user_plugins up ON p.id = up.plugin_id
    WHERE up.user_id = ? AND up.is_enabled = 1
    ORDER BY p.is_builtin DESC, p.name ASC
  `).all(userId);
  return plugins;
};
const updatePlugin = async (data) => {
  const db2 = getDb();
  const updates = [];
  const values = [];
  if (data.name !== void 0) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.version !== void 0) {
    updates.push("version = ?");
    values.push(data.version);
  }
  if (data.description !== void 0) {
    updates.push("description = ?");
    values.push(data.description);
  }
  if (data.entryPoint !== void 0) {
    updates.push("entry_point = ?");
    values.push(data.entryPoint);
  }
  if (data.icon !== void 0) {
    updates.push("icon = ?");
    values.push(data.icon);
  }
  if (data.author !== void 0) {
    updates.push("author = ?");
    values.push(data.author);
  }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(data.id);
    db2.prepare(`UPDATE plugins SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  return getPlugin(data.id);
};
const togglePlugin = async (pluginId, enabled) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  db2.prepare(`
    UPDATE user_plugins SET is_enabled = ? WHERE user_id = ? AND plugin_id = ?
  `).run(enabled ? 1 : 0, userId, pluginId);
};
const registerPluginIpcHandlers = () => {
  electron.ipcMain.handle("plugin:list", async () => {
    try {
      const plugins = await listPlugins();
      return createResponse(plugins);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:get", async (_event, id) => {
    try {
      const plugin = await getPlugin(id);
      return createResponse(plugin);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:create", async (_event, data) => {
    try {
      const plugin = await createPlugin(data);
      return createResponse(plugin);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:install", async (_event, id) => {
    try {
      await installPlugin(id);
      return createResponse(null, true, "Plugin installed");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:uninstall", async (_event, id) => {
    try {
      await uninstallPlugin(id);
      return createResponse(null, true, "Plugin uninstalled");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:update", async (_event, data) => {
    try {
      const plugin = await updatePlugin(data);
      return createResponse(plugin);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:getInstalled", async () => {
    try {
      const plugins = await getInstalledPlugins();
      return createResponse(plugins);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("plugin:toggle", async (_event, { id, enabled }) => {
    try {
      await togglePlugin(id, enabled);
      return createResponse(null, true, enabled ? "Plugin enabled" : "Plugin disabled");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const getUploadsDir = () => {
  const userDataPath = electron.app.getPath("userData");
  const uploadsDir = path.join(userDataPath, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};
const uploadFile = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const uploadsDir = getUploadsDir();
  const fileId = v4();
  const ext = data.name.split(".").pop() || "";
  const fileName = `${fileId}.${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(data.buffer));
  const db2 = getDb();
  db2.prepare(`
    INSERT INTO files (id, name, path, type, mime_type, size, owner_id)
    VALUES (?, ?, ?, 'FILE', ?, ?, ?)
  `).run(
    fileId,
    data.name,
    fileName,
    data.mimeType,
    data.buffer.byteLength,
    userId
  );
  return {
    name: fileName,
    originalName: data.name,
    link: `file://${filePath}`
  };
};
const getRootFolder = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const files = db2.prepare(`
    SELECT * FROM files 
    WHERE owner_id = ? AND parent_id IS NULL
    ORDER BY type DESC, name ASC
  `).all(userId);
  return files;
};
const getChildren = async (parentId) => {
  const db2 = getDb();
  const files = db2.prepare(`
    SELECT * FROM files 
    WHERE parent_id = ?
    ORDER BY type DESC, name ASC
  `).all(parentId);
  return files;
};
const createFolder = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const folderId = v4();
  db2.prepare(`
    INSERT INTO files (id, name, path, type, parent_id, repository_key, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    folderId,
    data.name,
    data.path || folderId,
    data.type || "FOLDER",
    data.parentId || null,
    data.repositoryKey || null,
    userId
  );
  return db2.prepare(`SELECT * FROM files WHERE id = ?`).get(folderId);
};
const deleteFile = async (id) => {
  const db2 = getDb();
  const file = db2.prepare(`SELECT * FROM files WHERE id = ?`).get(id);
  if (!file) {
    throw new Error("File not found");
  }
  if (file.type === "FOLDER") {
    const children = db2.prepare(`SELECT id FROM files WHERE parent_id = ?`).all(id);
    for (const child of children) {
      await deleteFile(child.id);
    }
  }
  if (file.type === "FILE") {
    const uploadsDir = getUploadsDir();
    const filePath = path.join(uploadsDir, file.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  db2.prepare(`DELETE FROM files WHERE id = ?`).run(id);
};
const downloadFile = async (id) => {
  const db2 = getDb();
  const file = db2.prepare(`SELECT * FROM files WHERE id = ?`).get(id);
  if (!file || file.type !== "FILE") {
    throw new Error("File not found");
  }
  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, file.path);
  if (!fs.existsSync(filePath)) {
    throw new Error("File not found on disk");
  }
  return {
    path: filePath,
    name: file.name,
    mimeType: file.mime_type || "application/octet-stream"
  };
};
const renameFile = async (id, newName) => {
  const db2 = getDb();
  db2.prepare(`
    UPDATE files SET name = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newName, id);
  return db2.prepare(`SELECT * FROM files WHERE id = ?`).get(id) || null;
};
const getFileUrl = (fileName) => {
  const uploadsDir = getUploadsDir();
  return `file://${path.join(uploadsDir, fileName)}`;
};
const registerFileIpcHandlers = () => {
  electron.ipcMain.handle("file:upload", async (_event, data) => {
    try {
      const result = await uploadFile(data);
      return createResponse(result);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:getRootFolder", async () => {
    try {
      const files = await getRootFolder();
      return createResponse(files);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:getChildren", async (_event, parentId) => {
    try {
      const files = await getChildren(parentId);
      return createResponse(files);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:createFolder", async (_event, data) => {
    try {
      const folder = await createFolder(data);
      return createResponse(folder);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:delete", async (_event, id) => {
    try {
      await deleteFile(id);
      return createResponse(null, true, "File deleted");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:download", async (_event, id) => {
    try {
      const result = await downloadFile(id);
      electron.shell.openPath(result.path);
      return createResponse(result);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:rename", async (_event, { id, newName }) => {
    try {
      const file = await renameFile(id, newName);
      return createResponse(file);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("file:getUrl", async (_event, fileName) => {
    try {
      const url = getFileUrl(fileName);
      return createResponse({ url });
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const sendMessage = async (data) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const messageId = v4();
  db2.prepare(`
    INSERT INTO messages (id, sender_id, receiver_id, content, content_type, status)
    VALUES (?, ?, ?, ?, ?, 'SENT')
  `).run(
    messageId,
    userId,
    data.receiverId,
    data.content,
    data.contentType || "TEXT"
  );
  return db2.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId);
};
const getConversation = async (otherUserId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const messages = db2.prepare(`
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY sent_time ASC
  `).all(userId, otherUserId, otherUserId, userId);
  return messages;
};
const getConversations = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const conversations = db2.prepare(`
    SELECT DISTINCT
      CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as partner_id
    FROM messages
    WHERE sender_id = ? OR receiver_id = ?
  `).all(userId, userId, userId);
  const result = [];
  for (const conv of conversations) {
    const partner = db2.prepare(`
      SELECT id, username, avatar, nickname FROM users WHERE id = ?
    `).get(conv.partner_id);
    if (!partner) continue;
    const lastMessage = db2.prepare(`
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY sent_time DESC
      LIMIT 1
    `).get(userId, conv.partner_id, conv.partner_id, userId);
    const unread = db2.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE sender_id = ? AND receiver_id = ? AND status != 'READ'
    `).get(conv.partner_id, userId);
    result.push({
      conversationId: `${userId}_${conv.partner_id}`,
      userId: partner.id,
      userName: partner.nickname || partner.username,
      userAvatar: partner.avatar,
      lastMessageContent: (lastMessage == null ? void 0 : lastMessage.content) || "",
      lastMessageContentType: (lastMessage == null ? void 0 : lastMessage.content_type) || "TEXT",
      lastMessageTime: (lastMessage == null ? void 0 : lastMessage.sent_time) || "",
      unreadCount: unread.count
    });
  }
  result.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  return result;
};
const getUnreadCount = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const result = db2.prepare(`
    SELECT COUNT(*) as count FROM messages 
    WHERE receiver_id = ? AND status != 'READ'
  `).get(userId);
  return result.count;
};
const getUnreadMessages = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const messages = db2.prepare(`
    SELECT * FROM messages 
    WHERE receiver_id = ? AND status != 'READ'
    ORDER BY sent_time DESC
  `).all(userId);
  return messages;
};
const markRead = async (messageIds) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  for (const id of messageIds) {
    db2.prepare(`
      UPDATE messages 
      SET status = 'READ', read_time = datetime('now')
      WHERE id = ? AND receiver_id = ?
    `).run(id, userId);
  }
};
const markAllRead = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  db2.prepare(`
    UPDATE messages 
    SET status = 'READ', read_time = datetime('now')
    WHERE receiver_id = ? AND status != 'READ'
  `).run(userId);
};
const deleteMessage = async (messageId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  db2.prepare(`
    DELETE FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
  `).run(messageId, userId, userId);
};
const clearConversation = async (otherUserId) => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  db2.prepare(`
    DELETE FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  `).run(userId, otherUserId, otherUserId, userId);
};
const getOnlineUsers = async () => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Not logged in");
  const db2 = getDb();
  const users = db2.prepare(`
    SELECT id, username, email, avatar, nickname FROM users WHERE id != ?
  `).all(userId);
  return users.map((u) => ({
    ...u,
    isOnline: true
    // In desktop mode, consider all users as "online"
  }));
};
const checkUserOnline = async (targetUserId) => {
  return true;
};
const getOnlineCount = async () => {
  const users = await getOnlineUsers();
  return users.length;
};
const registerImIpcHandlers = () => {
  electron.ipcMain.handle("im:send", async (_event, data) => {
    try {
      const message = await sendMessage(data);
      return createResponse(message);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getConversation", async (_event, userId) => {
    try {
      const messages = await getConversation(userId);
      return createResponse(messages);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getConversations", async () => {
    try {
      const conversations = await getConversations();
      return createResponse(conversations);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getUnreadCount", async () => {
    try {
      const count = await getUnreadCount();
      return createResponse({ count });
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getUnreadMessages", async () => {
    try {
      const messages = await getUnreadMessages();
      return createResponse(messages);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:markRead", async (_event, messageIds) => {
    try {
      await markRead(messageIds);
      return createResponse(null, true, "Messages marked as read");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:markAllRead", async () => {
    try {
      await markAllRead();
      return createResponse(null, true, "All messages marked as read");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:deleteMessage", async (_event, messageId) => {
    try {
      await deleteMessage(messageId);
      return createResponse(null, true, "Message deleted");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:clearConversation", async (_event, userId) => {
    try {
      await clearConversation(userId);
      return createResponse(null, true, "Conversation cleared");
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getOnlineUsers", async () => {
    try {
      const users = await getOnlineUsers();
      return createResponse(users);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:checkUserOnline", async (_event, userId) => {
    try {
      const isOnline = await checkUserOnline(userId);
      return createResponse({ isOnline });
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
  electron.ipcMain.handle("im:getOnlineCount", async () => {
    try {
      const count = await getOnlineCount();
      return createResponse({ count });
    } catch (error) {
      return createErrorResponse(error.message);
    }
  });
};
const registerAllIpcHandlers = () => {
  console.log("Registering IPC handlers...");
  registerAuthIpcHandlers();
  registerUserIpcHandlers();
  registerSpaceIpcHandlers();
  registerPageIpcHandlers();
  registerPluginIpcHandlers();
  registerFileIpcHandlers();
  registerImIpcHandlers();
  console.log("All IPC handlers registered successfully");
};
const createResponse = (data, success = true, msg = "Success", code = 200) => {
  return {
    code,
    success,
    msg,
    data
  };
};
const createErrorResponse = (msg, code = 500) => {
  return {
    code,
    success: false,
    msg,
    data: null
  };
};
exports.mainWindow = null;
const createWindow = () => {
  exports.mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    titleBarStyle: "hiddenInset",
    show: false
  });
  exports.mainWindow.once("ready-to-show", () => {
    var _a;
    (_a = exports.mainWindow) == null ? void 0 : _a.show();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    exports.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    exports.mainWindow.webContents.openDevTools();
  } else {
    exports.mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
  exports.mainWindow.on("closed", () => {
    exports.mainWindow = null;
  });
};
electron.app.whenReady().then(async () => {
  await initDatabase();
  registerAllIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
});
//# sourceMappingURL=index.js.map
