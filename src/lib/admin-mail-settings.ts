import { Client } from "pg"

const DEFAULT_ORDER_RECIPIENTS = [
  "saswatp99@gmail.com",
  "pandeysanjay494@gmail.com",
]

const getClient = () =>
  new Client({
    connectionString: process.env.DATABASE_URL,
  })

const parseEmailList = (value: unknown) =>
  Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  )

const getDefaultOrderRecipients = () => {
  const configured = parseEmailList(
    process.env.ORDER_STAKEHOLDER_EMAILS ||
      process.env.ADMIN_ORDER_NOTIFY_EMAILS ||
      process.env.ADMIN_NOTIFY_EMAIL
  )

  return configured.length ? configured : DEFAULT_ORDER_RECIPIENTS
}

const ensureMailSettingsTable = async (client: Client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_mail_settings (
      id text PRIMARY KEY DEFAULT 'default',
      order_stakeholder_recipients text NOT NULL DEFAULT '',
      order_stakeholder_enabled boolean NOT NULL DEFAULT true,
      customer_order_enabled boolean NOT NULL DEFAULT true,
      ai_wallet_enabled boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await client.query(`
    ALTER TABLE admin_mail_settings
      ADD COLUMN IF NOT EXISTS order_stakeholder_recipients text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS order_stakeholder_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS customer_order_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS ai_wallet_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
}

export const getMailSettings = async () => {
  const client = getClient()

  await client.connect()

  try {
    await ensureMailSettingsTable(client)

    const result = await client.query(`
      SELECT *
      FROM admin_mail_settings
      WHERE id = 'default'
      LIMIT 1
    `)
    const row = result.rows[0]
    const recipients = parseEmailList(row?.order_stakeholder_recipients)

    return {
      order_stakeholder_recipients: recipients.length
        ? recipients
        : getDefaultOrderRecipients(),
      order_stakeholder_enabled:
        row?.order_stakeholder_enabled === undefined
          ? true
          : Boolean(row.order_stakeholder_enabled),
      customer_order_enabled:
        row?.customer_order_enabled === undefined
          ? true
          : Boolean(row.customer_order_enabled),
      ai_wallet_enabled:
        row?.ai_wallet_enabled === undefined
          ? true
          : Boolean(row.ai_wallet_enabled),
      updated_at: row?.updated_at || null,
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

export const saveMailSettings = async (input: {
  order_stakeholder_recipients?: string[] | string
  order_stakeholder_enabled?: boolean
  customer_order_enabled?: boolean
  ai_wallet_enabled?: boolean
}) => {
  const client = getClient()
  const recipients = Array.isArray(input.order_stakeholder_recipients)
    ? parseEmailList(input.order_stakeholder_recipients.join(","))
    : parseEmailList(input.order_stakeholder_recipients)

  if (!recipients.length) {
    throw new Error("Add at least one valid stakeholder email.")
  }

  await client.connect()

  try {
    await ensureMailSettingsTable(client)

    await client.query(
      `
      INSERT INTO admin_mail_settings (
        id,
        order_stakeholder_recipients,
        order_stakeholder_enabled,
        customer_order_enabled,
        ai_wallet_enabled,
        updated_at
      )
      VALUES ('default', $1, $2, $3, $4, now())
      ON CONFLICT (id) DO UPDATE SET
        order_stakeholder_recipients = EXCLUDED.order_stakeholder_recipients,
        order_stakeholder_enabled = EXCLUDED.order_stakeholder_enabled,
        customer_order_enabled = EXCLUDED.customer_order_enabled,
        ai_wallet_enabled = EXCLUDED.ai_wallet_enabled,
        updated_at = now()
      `,
      [
        recipients.join(","),
        input.order_stakeholder_enabled !== false,
        input.customer_order_enabled !== false,
        input.ai_wallet_enabled !== false,
      ]
    )

    return getMailSettings()
  } finally {
    await client.end().catch(() => undefined)
  }
}
