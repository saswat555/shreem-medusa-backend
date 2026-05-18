import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260517170000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "ai_usage_log" (
        "id" text not null,
        "customer_id" text not null,
        "customer_email" text null,
        "tool" text not null,
        "input_json" jsonb not null default '{}',
        "response_json" jsonb not null default '{}',
        "metadata_json" jsonb not null default '{}',
        "model" text null,
        "expert_recommended" boolean not null default false,
        "admin_status" text not null default 'new',
        "admin_notes" text null,
        "tags" jsonb not null default '[]',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ai_usage_log_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      create index if not exists "IDX_ai_usage_log_customer_created_at"
      on "ai_usage_log" ("customer_id", "created_at")
      where "deleted_at" is null;
    `)

    this.addSql(`
      create index if not exists "IDX_ai_usage_log_tool_created_at"
      on "ai_usage_log" ("tool", "created_at")
      where "deleted_at" is null;
    `)

    this.addSql(`
      create index if not exists "IDX_ai_usage_log_expert_created_at"
      on "ai_usage_log" ("expert_recommended", "created_at")
      where "deleted_at" is null;
    `)

    this.addSql(`
      create index if not exists "IDX_ai_usage_log_admin_status_created_at"
      on "ai_usage_log" ("admin_status", "created_at")
      where "deleted_at" is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_usage_log" cascade;`)
  }
}
