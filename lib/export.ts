import type { Tx } from "@/lib/db";
import { FORMER_MEMBER } from "@/lib/bills";
import { csvField } from "@/lib/trends";

// Every bill and payment as CSV (/{slug}/household/export): one row per share owed on a bill,
// and one row with no debtor for a bill nobody owed on. Any member, any time; the deletion flow
// points at it so nobody loses their records when a household goes (lib/deletion.ts).

export interface ExportRow {
  billId: number;
  typeName: string;
  billDate: string;
  dueDate: string;
  total: number;
  perPersonCost: number;
  status: string;
  /** The bill's owner: a name, "former member", or null (owed to the house). */
  owner: string | null;
  /** Who owes the share; null for a bill nobody owed on. */
  debtor: string | null;
  paidAt: Date | null;
}

export function exportRows(tx: Tx): Promise<ExportRow[]> {
  return tx<ExportRow[]>`
    SELECT b.id AS "billId", t.name AS "typeName", b.bill_date AS "billDate", b.due_date AS "dueDate",
           b.total, b.per_person_cost AS "perPersonCost", b.status,
           CASE WHEN b.owner_id IS NULL AND b.had_owner THEN ${FORMER_MEMBER}::text ELSE ou.name END AS owner,
           du.name AS debtor, d.paid_at AS "paidAt"
    FROM bills b
    JOIN bill_types t ON t.id = b.type_id
    LEFT JOIN memberships om ON om.id = b.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    LEFT JOIN bill_debts d ON d.bill_id = b.id
    LEFT JOIN memberships dm ON dm.id = d.person_id
    LEFT JOIN users du ON du.id = dm.user_id
    ORDER BY b.bill_date, b.id, du.name`;
}

const HEADER = ["Bill", "Type", "Statement date", "Due date", "Total", "Share", "Bill status", "Owed to", "Owed by", "Paid on"];

/** The CSV, dates as YYYY-MM-DD (paid dates in the household's calendar). */
export function billsCsv(rows: ExportRow[], timezone: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: timezone }); // en-CA is YYYY-MM-DD
  const lines = [HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.billId),
        csvField(r.typeName),
        r.billDate,
        r.dueDate,
        r.total.toFixed(2),
        r.perPersonCost.toFixed(2),
        r.status,
        csvField(r.owner ?? "the house"),
        csvField(r.debtor ?? ""),
        r.paidAt ? day(r.paidAt) : "",
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
