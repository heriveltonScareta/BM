import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { readMultipart } from "@/lib/api/upload";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { invoiceSchema, invoiceStatusSchema } from "@/lib/validation/invoice";
import { attachInvoice, getBillingInfo, updateInvoiceStatus } from "@/lib/services/billing.service";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  return NextResponse.json(await getBillingInfo(getScope(user), idSchema.parse(id)));
});

/** multipart: number, series, issueDate, amount, notes, pdf (File), xml (File). */
export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("faturamento:gerenciar");
  const { id } = await ctx.params;
  const { fields, files } = await readMultipart(req);
  const data = invoiceSchema.parse(fields);
  const result = await attachInvoice(
    user,
    getScope(user),
    idSchema.parse(id),
    data,
    { pdf: files.pdf, xml: files.xml },
    actorFromRequest(user, req),
  );
  return NextResponse.json({
    invoice: {
      id: result.invoice.id,
      number: result.invoice.number,
      amount: result.invoice.amount.toString(),
      status: result.invoice.status,
    },
    alert: result.alert,
  });
});

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("faturamento:gerenciar");
  const { id } = await ctx.params;
  const data = invoiceStatusSchema.parse(await readJson(req));
  const invoice = await updateInvoiceStatus(
    user,
    getScope(user),
    idSchema.parse(id),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json({ id: invoice.id, status: invoice.status, sentAt: invoice.sentAt });
});
