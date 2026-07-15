require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from the backend environment.');
  }

  const sql = neon(process.env.DATABASE_URL);
  const migrationDirectory = path.join(__dirname, 'migrations');
  const migrationFiles = (await fs.readdir(migrationDirectory)).filter(file => file.endsWith('.sql')).sort();

  for (const migrationFile of migrationFiles) {
    const migration = await fs.readFile(path.join(migrationDirectory, migrationFile), 'utf8');
    const statements = migration.split(';').map(statement => statement.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
  }

  console.log('Access-control database migration completed successfully.');
}

migrate().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
