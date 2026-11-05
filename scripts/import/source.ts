// Reads one legacy household's TiDB database (../utilities or ../peach-cob, MySQL dialect) into
// plain rows for transform.ts. The two schemas differ only in a few optional columns
// (peach-cob's people.splits_bills / welcomed_at and bill_types.owner_id / bills.added_by_id;
// utilities' documents and rent_config), so one reader covers both: a missing column reads as
// its default, a missing table as empty.
//
// Env, per source, with PREFIX = SRC_UTIL or SRC_PC:
//   {PREFIX}_DB_HOST / _DB_PORT (4000) / _DB_NAME / _DB_USER / _DB_PASS   TiDB Cloud (TLS)
//   {PREFIX}_BLOB_TOKEN                                                   that app's public Blob store

import mysql, { type RowDataPacket } from "mysql2/promise";

export interface SourcePerson {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  splitsBills: boolean;
  welcomedAt: Date | null;
}
export interface SourceBillType {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
  ownerId: number | null;
}
export interface SourceBill {
  id: number;
  typeId: number;
  billDate: string; // YYYY-MM-DD
  dueDate: string;
  total: number;
  perPersonCost: number;
  status: "unpaid" | "paid";
  pdfPath: string | null; // store-relative blob key
  addedById: number | null;
}
export interface SourceDebt {
  billId: number;
  personId: number; // still owes (the old apps deleted the row on payment)
}
export interface SourceDocument {
  id: number;
  title: string;
  category: string;
  filePath: string; // store-relative blob key, always documents/…
  contentType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedById: number | null;
}
export interface SourceRent {
  monthlyRent: number;
  leaseStart: string;
  leaseEnd: string;
}
export interface SourceReminders {
  enabled: boolean;
  sendHour: number;
  firstReminderDays: number;
  urgentReminderDays: number;
  lastRunAt: Date | null;
  lastSendDate: string | null;
  lastSentAt: Date | null;
  lastSentCount: number;
}
export interface Source {
  people: SourcePerson[];
  billTypes: SourceBillType[];
  bills: SourceBill[];
  debts: SourceDebt[];
  documents: SourceDocument[];
  rent: SourceRent | null;
  reminders: SourceReminders | null;
}

export type SourcePrefix = "SRC_UTIL" | "SRC_PC";

export function sourceEnv(prefix: SourcePrefix, key: string, required = true): string {
  const name = `${prefix}_${key}`;
  const v = process.env[name];
  if (!v && required) throw new Error(`${name} is not set (.env.import.local)`);
  return v ?? "";
}

/** The old apps stored DATETIME in UTC; mysql2's dateStrings hands it back as "YYYY-MM-DD HH:MM:SS". */
const utc = (s: string | null | undefined): Date | null => (s ? new Date(`${s.replace(" ", "T")}Z`) : null);

export async function readSource(prefix: SourcePrefix): Promise<Source> {
  const conn = await mysql.createConnection({
    host: sourceEnv(prefix, "DB_HOST"),
    port: Number(sourceEnv(prefix, "DB_PORT", false) || 4000),
    database: sourceEnv(prefix, "DB_NAME"),
    user: sourceEnv(prefix, "DB_USER"),
    password: sourceEnv(prefix, "DB_PASS"),
    // TiDB Cloud Serverless requires TLS; its certs chain to public CAs (../utilities/lib/db.ts).
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    dateStrings: true,
    decimalNumbers: true,
  });
  try {
    const [tableRows] = await conn.query<RowDataPacket[]>("SHOW TABLES");
    const tables = new Set(tableRows.map((r) => String(Object.values(r)[0])));
    const has = (t: string) => tables.has(t);
    const columns = async (t: string) => {
      const [rows] = await conn.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${t}\``);
      return new Set(rows.map((r) => String(r.Field)));
    };
    const rows = async <T = RowDataPacket>(q: string): Promise<T[]> => (await conn.query<RowDataPacket[]>(q))[0] as T[];

    const peopleCols = await columns("people");
    const people = (await rows("SELECT * FROM people ORDER BY id")).map<SourcePerson>((r) => ({
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      isAdmin: Boolean(r.is_admin),
      splitsBills: peopleCols.has("splits_bills") ? Boolean(r.splits_bills) : true,
      welcomedAt: peopleCols.has("welcomed_at") ? utc(r.welcomed_at) : null,
    }));

    const typeCols = await columns("bill_types");
    const billTypes = (await rows("SELECT * FROM bill_types ORDER BY id")).map<SourceBillType>((r) => ({
      id: Number(r.id),
      name: String(r.name),
      emoji: String(r.emoji ?? ""),
      processingFee: Number(r.processing_fee ?? 0),
      ownerId: typeCols.has("owner_id") && r.owner_id != null ? Number(r.owner_id) : null,
    }));

    const billCols = await columns("bills");
    const bills = (await rows("SELECT * FROM bills ORDER BY id")).map<SourceBill>((r) => ({
      id: Number(r.id),
      typeId: Number(r.type_id),
      billDate: String(r.bill_date),
      dueDate: String(r.due_date),
      total: Number(r.total),
      perPersonCost: Number(r.per_person_cost),
      status: r.status === "paid" ? "paid" : "unpaid",
      pdfPath: r.pdf_path ? String(r.pdf_path) : null,
      addedById: billCols.has("added_by_id") && r.added_by_id != null ? Number(r.added_by_id) : null,
    }));

    const debts = (await rows("SELECT * FROM bill_debts ORDER BY bill_id, person_id")).map<SourceDebt>((r) => ({
      billId: Number(r.bill_id),
      personId: Number(r.person_id),
    }));

    const documents = has("documents")
      ? (await rows("SELECT * FROM documents ORDER BY id")).map<SourceDocument>((r) => ({
          id: Number(r.id),
          title: String(r.title),
          category: String(r.category),
          filePath: String(r.file_path),
          contentType: String(r.content_type),
          fileSize: Number(r.file_size),
          uploadedAt: utc(r.uploaded_at) ?? new Date(),
          uploadedById: r.uploaded_by != null ? Number(r.uploaded_by) : null,
        }))
      : [];

    // Both config tables are "newest row wins" in the old apps.
    const [rent] = has("rent_config") ? await rows("SELECT * FROM rent_config ORDER BY id DESC LIMIT 1") : [];
    const [rem] = has("reminder_config") ? await rows("SELECT * FROM reminder_config ORDER BY id DESC LIMIT 1") : [];

    return {
      people,
      billTypes,
      bills,
      debts,
      documents,
      rent: rent ? { monthlyRent: Number(rent.monthly_rent), leaseStart: String(rent.lease_start), leaseEnd: String(rent.lease_end) } : null,
      reminders: rem
        ? {
            enabled: Boolean(rem.enabled),
            sendHour: Number(rem.send_hour),
            firstReminderDays: Number(rem.first_reminder_days),
            urgentReminderDays: Number(rem.urgent_reminder_days),
            lastRunAt: utc(rem.last_run_at),
            lastSendDate: rem.last_send_date ? String(rem.last_send_date) : null,
            lastSentAt: utc(rem.last_sent_at),
            lastSentCount: Number(rem.last_sent_count ?? 0),
          }
        : null,
    };
  } finally {
    await conn.end();
  }
}
