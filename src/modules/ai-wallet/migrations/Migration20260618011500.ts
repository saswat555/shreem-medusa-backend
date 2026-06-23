import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260618011500 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create unique index if not exists "IDX_ai_credit_ledger_order_credit_once"
      on "ai_credit_ledger" ("order_id")
      where "deleted_at" is null
        and "type" = 'order_credit'
        and "order_id" is not null
        and coalesce("source", '') <> 'sync_credit_product_orders';
    `)

    this.addSql(`
      create unique index if not exists "IDX_ai_credit_ledger_recovery_razorpay_once"
      on "ai_credit_ledger" ((metadata_json->>'razorpay_order_id'))
      where "deleted_at" is null
        and "source" = 'razorpay_captured_cart_recovery'
        and metadata_json->>'razorpay_order_id' is not null;
    `)

    this.addSql(`
      create unique index if not exists "IDX_ai_credit_ledger_usage_once"
      on "ai_credit_ledger" ("customer_id", "usage_id")
      where "deleted_at" is null
        and "usage_id" is not null
        and "type" in ('consume', 'premium_usage');
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_ai_credit_ledger_usage_once";`)
    this.addSql(`drop index if exists "IDX_ai_credit_ledger_recovery_razorpay_once";`)
    this.addSql(`drop index if exists "IDX_ai_credit_ledger_order_credit_once";`)
  }
}
