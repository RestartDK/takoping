import { sql, SQL } from "bun";
import { env } from "@/env";

export const pg = env.DATABASE_URL ? new SQL(env.DATABASE_URL) : sql;

// Read and execute schema from file
export async function initSchema() {
	const schemaSQL = await Bun.file("src/db/schema.sql").text();
	const statements = schemaSQL.split(";").filter((s) => s.trim());

	for (const statement of statements) {
		if (statement.trim()) {
			await pg.unsafe(statement);
		}
	}

	console.log("PostgreSQL schema initialized");
}

