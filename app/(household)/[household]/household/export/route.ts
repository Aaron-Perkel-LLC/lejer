import { getCtx } from "@/lib/context";
import { slugify } from "@/lib/households";
import { loadExportCsv } from "@/lib/views";

// Every bill and payment as CSV, one row per share (lib/export.ts). Any member, any time, and
// still there while the household is marked for deletion: that's when it matters most.
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return new Response("Forbidden", { status: 403 });
  const csv = await loadExportCsv(ctx);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(ctx.household.name)}-bills-and-payments.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
