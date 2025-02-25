import { Database } from '@hocuspocus/extension-database'
import mysql from 'mysql'


export const schema = `CREATE TABLE IF NOT EXISTS documents (
  name varchar(255) NOT NULL,
  data longblob NOT NULL,
  UNIQUE(name)
)`

export const selectQuery = `
  SELECT data FROM documents WHERE name = ?
`

export const upsertQuery = `
  INSERT INTO documents (name, data) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE data = ?
`


export class Mysql extends Database {

  db
  pingInterval
  configuration = {
    schema,
    fetch: async ({ documentName }) => {
      return new Promise((resolve, reject) => {
        this.db?.query(selectQuery, [documentName], (error, row) => {
          if (error) {
            reject(error)
          }

          resolve((row)?.data)
        })
      })
    },
    store: async ({ documentName, state }) => {
      this.db?.query(upsertQuery, [documentName, state, state])
    },
  }

  constructor(configuration) {
    super({})

    this.configuration = {
      ...this.configuration,
      ...configuration,
    }
  }

  async onConfigure() {
    const connection = mysql.createConnection({
        host     : this.configuration.host,
        user     : this.configuration.username,
        password : this.configuration.password,
        database : this.configuration.database
      });
    
    connection.connect()
    this.db = connection
    this.db.query(this.configuration.schema)
    this.db.on('error', (err) => {
      this.db = null
      this.db = mysql.createConnection({
        host     : this.configuration.host,
        user     : this.configuration.username,
        password : this.configuration.password,
        database : this.configuration.database
      });
      this.db.connect()
      this.db.query(this.configuration.schema)
    })

    clearInterval(this.pingInterval)
    this.pingInterval = setInterval(() => {
      console.log('ping...');
      this.db.ping((err) => {
          if (err) {
              console.log('ping error: ' + JSON.stringify(err));
          }
      });
  }, 3600000);
  }

  async onListen() {
  }
}
