import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('department_of_files_schema'))");
    const result = await client.query<{ name: string; exists: boolean }>(
        `SELECT name, to_regclass(name) IS NOT NULL AS exists
         FROM unnest(ARRAY['users', 'files', 'session']) AS name`,
    );
    const present = result.rows.filter((row) => row.exists);
    if (present.length === 3) {
        console.log("The users, files and session tables already exist; no changes made.");
    } else if (present.length > 0) {
        throw new Error("Only part of the schema exists; apply a reviewed migration instead of reinitializing it");
    } else {
        const schema = await readFile(new URL("../../db/init.sql", import.meta.url), "utf8");
        await client.query(schema);
        console.log("Created the users, files and session schema.");
    }
    await client.query("COMMIT");
} catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
} finally {
    await client.end();
}
