import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260519001000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      alter table if exists "ai_usage_log"
        add column if not exists "estimated_cost_inr" numeric(14, 4) not null default 0;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      alter table if exists "ai_usage_log"
        drop column if exists "estimated_cost_inr";
    `)
  }
}
