import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260518123000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      alter table if exists "ai_usage_log"
        add column if not exists "prompt_tokens" integer not null default 0,
        add column if not exists "completion_tokens" integer not null default 0,
        add column if not exists "total_tokens" integer not null default 0,
        add column if not exists "estimated_cost_usd" numeric(12, 6) not null default 0;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      alter table if exists "ai_usage_log"
        drop column if exists "estimated_cost_usd",
        drop column if exists "total_tokens",
        drop column if exists "completion_tokens",
        drop column if exists "prompt_tokens";
    `)
  }
}
