import { Migration } from '@mikro-orm/migrations';

export class Migration20251130043619 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "users" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "email" varchar(255) not null, "password" varchar(255) not null, "phone_number" varchar(255) null, "two_factor_enabled" boolean not null, "first_name" varchar(255) null, "last_name" varchar(255) null, "role" smallint not null, "state" text check ("state" in ('ACTIVE', 'DISABLED', 'LOCKED')) not null, constraint "users_pkey" primary key ("id"));`);
    this.addSql(`create index "users_email_index" on "users" ("email");`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "users" cascade;`);
  }

}
