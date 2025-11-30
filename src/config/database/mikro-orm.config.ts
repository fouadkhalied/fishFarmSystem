import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

export default defineConfig({
  entities: ['dist/**/infrastructure/**/*.entity.js'],
  entitiesTs: ['src/**/infrastructure/**/*.entity.ts'],
  clientUrl: process.env.DATABASE_URL,
  extensions: [Migrator],
  migrations: {
    tableName: 'migrations',
    path: 'src/config/database/migrations',
  },
  driverOptions: {
    connection: {
      ssl: { rejectUnauthorized: false },
    },
  },
});
