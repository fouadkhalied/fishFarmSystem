import { Migration } from '@mikro-orm/migrations';
import { genSalt, hash } from 'bcryptjs';
import { v4 } from 'uuid';

export class CreateAdminCredentialsMigration extends Migration {
  async up(): Promise<void> {
    await this.getEntityManager()
      .getConnection()
      .execute(
        `INSERT INTO users (id, email, password, phone_number, two_factor_enabled, first_name, last_name, role, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING`,
        [
          v4(),
          'foukha49@gmail.com',
          await hash('12345!Aa', await genSalt()),
          '01558525293',
          true,
          'Admin',
          'Admin',
          0,
          'ACTIVE',
        ],
      );
  }

  async down(): Promise<void> {
    await this.getEntityManager()
      .getConnection()
      .execute(`DELETE FROM users WHERE role = 0`);
  }
}
