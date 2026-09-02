# Database migrations

`script/migration` is the authoritative location for ordered Knowledge Cloud database migrations. Existing `V1` through `V13` files are immutable history; new changes must use the next version and must not edit an applied migration.

Flyway is available only through the root Maven profile `db-migrate`. It has no lifecycle execution, is not inherited by service modules, does not run when a Spring Boot service starts, disables `clean`, disables out-of-order execution, and never baselines automatically.

## Required connection configuration

Run commands from `backend/knowledgecloud` and provide all three variables:

```bash
export FLYWAY_URL='jdbc:mysql://db.example:3306/knowledge?useSSL=true&useUnicode=true&characterEncoding=utf8&serverTimezone=UTC'
export FLYWAY_USER='knowledge_migrator'
export FLYWAY_PASSWORD='replace-me'
```

Equivalent one-command Maven properties are supported and override the environment-backed defaults:

```bash
mvn -N -Pdb-migrate flyway:info \
  -Dflyway.url='jdbc:mysql://db.example:3306/knowledge?useSSL=true&serverTimezone=UTC' \
  -Dflyway.user='knowledge_migrator' \
  -Dflyway.password='replace-me'
```

The migration principal needs Flyway history-table read/write access plus the DDL/DML used by the migrations. Across V1-V16 this includes `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `INDEX`, `TRIGGER`, `CREATE ROUTINE`, `ALTER ROUTINE`, and `EXECUTE`. Grant only on the target schema. Do not use an application service account for deployment migrations.

## Deployment commands

Always inspect and validate before migration:

```bash
mvn -N -Pdb-migrate flyway:info
mvn -N -Pdb-migrate flyway:validate
mvn -N -Pdb-migrate flyway:migrate
mvn -N -Pdb-migrate flyway:info
```

`-N` keeps the invocation on the root aggregator. The profile is also marked non-inherited as a second guard against running the goal once per service module.

### Existing database already manually migrated through V13

Do not run V1-V13 again. First verify from deployment records and schema inspection that every change through V13 is already present. Then create Flyway history at version 13 and apply V14:

```bash
mvn -N -Pdb-migrate flyway:baseline \
  -Dflyway.baselineVersion=13 \
  -Dflyway.baselineDescription='legacy schema verified through V13'
mvn -N -Pdb-migrate flyway:validate
mvn -N -Pdb-migrate flyway:migrate
```

Baselining is an explicit deployment decision. Never use `baselineOnMigrate`, and never select version 13 merely because it is the latest file.

### Base schema exists but none of V1-V13 has been applied

The historical chain is incremental and expects the legacy core/wiki base schema to exist; V1 is not an empty-database bootstrap. After verifying the base schema and confirming that none of V1-V13 has been applied, baseline at version 0 so Flyway executes the full chain:

```bash
mvn -N -Pdb-migrate flyway:baseline \
  -Dflyway.baselineVersion=0 \
  -Dflyway.baselineDescription='verified legacy base schema'
mvn -N -Pdb-migrate flyway:validate
mvn -N -Pdb-migrate flyway:migrate
```

If the database is partially migrated or its state is uncertain, stop. Reconcile it against each migration and choose a baseline only after the state is unambiguous. Do not use `repair` to conceal a checksum or failed-migration investigation.

## Identity and organization preflight

V14 creates nullable/additive schema foundations. V15 adds active global-account uniqueness and blocks legacy normalized-account conflicts. V16 adds active scoped-role and scoped-assignment uniqueness. Neither migration backfills legacy null accounts, selects personal contexts or tenant owners, classifies legacy roles, creates organization memberships, or reconciles wiki permissions.

Run the read-only report after V14 and before any such backfill. Use a read-only database principal. The script opens a read-only consistent-snapshot transaction and rolls it back:

```bash
export MYSQL_HOST='db.example'
export MYSQL_PORT='3306'
export MYSQL_DATABASE='knowledge'
mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" \
  --user="$FLYWAY_USER" --password --database="$MYSQL_DATABASE" \
  --show-warnings --table \
  < script/preflight/identity_organization_preflight.sql \
  | tee identity-organization-preflight.txt
```

Every returned data row is a review item. An empty result set for each numbered check is the success condition. The report covers:

1. duplicate case/whitespace-normalized active accounts across all tenants;
2. individual tenants containing more than one active user;
3. mismatches between legacy `knowledge_user.role_id` CSV values and `knowledge_user_role` rows, including cross-tenant relation rows;
4. missing, conflicting, or multiple `OWNER` memberships for a space's recorded owner;
5. legacy space permission rows that disagree with current member roles or point to missing spaces/members.

The space checks detect both the current `wiki_space_permission(user_id, space_id, permissions)` shape and the oldest bootstrap `owner_id/space_key/operation/has_permission` shape. A `SKIPPED` diagnostic means the deployed schema is neither supported shape and must be inspected manually; it is not a pass.

## V18 file-center OSS path migration

`V18__knowledge_file_path_object_key.sql` converts legacy MinIO URLs stored in
`knowledge_file.path` into provider-neutral object keys. Deploy the file-center
compatibility code before applying V18 so both the old URL form and the new key
form remain readable during rollout.

Back up at least `knowledge_file(id, path, file_key)` before migration. Supply the
exact endpoint and bucket used when the legacy rows were created:

```bash
mvn -N -Pdb-migrate flyway:info \
  -Dflyway.placeholders.ossEndpoint='http://192.168.3.43:9000' \
  -Dflyway.placeholders.ossBucket='knowledge'

mvn -N -Pdb-migrate flyway:validate \
  -Dflyway.placeholders.ossEndpoint='http://192.168.3.43:9000' \
  -Dflyway.placeholders.ossBucket='knowledge'

mvn -N -Pdb-migrate flyway:migrate \
  -Dflyway.placeholders.ossEndpoint='http://192.168.3.43:9000' \
  -Dflyway.placeholders.ossBucket='knowledge'
```

V18 fails before updating rows when an HTTP path does not match the configured
endpoint/bucket or would produce an empty object key. Inspect and reconcile those
rows instead of using `repair` or weakening the preflight.

After migration, verify:

```sql
SELECT COUNT(*) AS remaining_http_paths
FROM knowledge_file
WHERE type = 'FILE'
  AND (path LIKE 'http://%' OR path LIKE 'https://%');

SELECT id, path, file_key
FROM knowledge_file
WHERE type = 'FILE'
ORDER BY id DESC
LIMIT 20;
```

Do not roll back to application code that downloads OSS objects through
`file_key` after V18 has run. Restore the database backup if a full rollback is
required.
