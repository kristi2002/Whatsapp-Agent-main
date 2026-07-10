import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(messages);
}

/**
 * Clear the whole thread for a conversation (staff "Svuota chat"). Deletes every
 * message row but keeps the conversation itself (phone/name/mode preserved), so
 * a fresh inbound message continues the same conversation.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Bump updated_at so the conversation list reflects the change immediately.
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json({ ok: true });
}
