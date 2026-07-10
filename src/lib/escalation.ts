/**
 * Human-handoff helper shared by the tool dispatcher (when the model calls
 * `escalate_to_human`) and the AI safety net (when the model *claims* it handed
 * off but never called the tool). Keeps the "flip to human + alert staff"
 * behaviour in one place so both paths stay identical.
 */
import { escalateToHuman } from "@/lib/booking";
import { notifyStaff } from "@/lib/whatsapp";

export async function escalateAndNotify(params: {
  conversationId: string | null;
  customerPhone: string;
  customerName: string | null;
  reason?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const res = await escalateToHuman({ conversationId: params.conversationId });
  if (res.ok) {
    const who = params.customerName
      ? `${params.customerName} (${params.customerPhone})`
      : params.customerPhone;
    const reason = params.reason ? ` — motivo: ${params.reason}` : "";
    void notifyStaff(
      `🙋 Un cliente ha bisogno di un operatore: ${who}${reason}. ` +
        `La conversazione è ora in modalità "Manuale": rispondi dalla dashboard (Conversazioni).`
    );
  }
  return res;
}
