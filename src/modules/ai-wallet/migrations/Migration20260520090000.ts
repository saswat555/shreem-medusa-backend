import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260520090000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "ai_wallet" (
        "id" text not null,
        "customer_id" text not null,
        "customer_email" text null,
        "credit_balance" integer not null default 0,
        "plan" text not null default 'free',
        "plan_expires_at" timestamptz null,
        "pro_question_limit" integer not null default 0,
        "metadata_json" jsonb not null default '{}',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ai_wallet_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      create unique index if not exists "IDX_ai_wallet_customer_id"
      on "ai_wallet" ("customer_id")
      where "deleted_at" is null;
    `)

    this.addSql(`
      create table if not exists "ai_credit_ledger" (
        "id" text not null,
        "wallet_id" text not null,
        "customer_id" text not null,
        "customer_email" text null,
        "type" text not null,
        "source" text null,
        "credits" integer not null default 0,
        "balance_after" integer not null default 0,
        "order_id" text null,
        "usage_id" text null,
        "note" text null,
        "metadata_json" jsonb not null default '{}',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ai_credit_ledger_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      create index if not exists "IDX_ai_credit_ledger_customer_created_at"
      on "ai_credit_ledger" ("customer_id", "created_at")
      where "deleted_at" is null;
    `)

    this.addSql(`
      create index if not exists "IDX_ai_credit_ledger_wallet_created_at"
      on "ai_credit_ledger" ("wallet_id", "created_at")
      where "deleted_at" is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_credit_ledger" cascade;`)
    this.addSql(`drop table if exists "ai_wallet" cascade;`)
  }
}
