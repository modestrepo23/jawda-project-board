// Jawda — Claude assistant for the Production Runs page.
// Deploy: Supabase → Edge Functions → Deploy a new function → name "runs-assistant" → paste this file.
// Secret: Edge Functions → Secrets → ANTHROPIC_API_KEY = your key from console.anthropic.com
// Only signed-in team members can call it (Supabase checks the login before this code runs).
// It never changes data itself: it sends back proposed changes that the page shows for approval.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

const SYSTEM = `You help Jawda (a modest-fashion brand) edit its production runs in Bangladesh.
You get the current runs, each run's lines (one line = one design in one fabric colour, with pieces per size and yards per piece), the fabrics with yards left after every run, and the planning rules.

Turn the user's request into changes by calling the propose_changes tool. Rules:
- Only use ids that appear in the data. Never invent ids.
- "Move X to run Y" = move_lines for every line of that design on its current run (unless the user narrows it to colours), keeping sizes.
- If a design is on several runs and the user doesn't say which, pick the earliest run that isn't Shipped or Delivered, and say so in the summary.
- Dates like "18 Nov" or "12 Jan" refer to run_date; run names can repeat, so match on date first.
- Factory minimums: moq_design pieces per design per run and moq_colour pieces per colour. If a change breaks a minimum or leaves a fabric short, still propose it if asked, but add a warning.
- When changing quantities, keep the size curve's shape unless told otherwise; round to whole pieces.
- If the request is unclear or needs data you don't have, don't call the tool – reply with one short question.
- Keep "summary" to one plain sentence per change. Keep "reply" to two sentences at most.`;

const TOOL = {
  name: "propose_changes",
  description: "Propose edits to production runs for the user to approve.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Short message to the user about what you propose." },
      warnings: { type: "array", items: { type: "string" } },
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["move_lines", "update_line", "add_line", "delete_lines", "update_run"] },
            summary: { type: "string" },
            line_ids: { type: "array", items: { type: "string" }, description: "move_lines / delete_lines" },
            to_run_id: { type: "string", description: "move_lines" },
            line_id: { type: "string", description: "update_line" },
            run_id: { type: "string", description: "add_line / update_run" },
            design: { type: "string" },
            fabric_id: { type: "string" },
            sizes: { type: "object", additionalProperties: { type: "integer" }, description: "Full size map, e.g. {\"50\":8,\"52\":16}" },
            consumption: { type: "number" },
            sample_approved: { type: "boolean" },
            production_approved: { type: "boolean" },
            name: { type: "string" },
            run_date: { type: "string" },
            status: { type: "string", enum: ["Planning", "Approved", "In production", "Shipped", "Delivered"] },
            target: { type: "integer" },
          },
          required: ["op", "summary"],
        },
      },
    },
    required: ["reply", "ops"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "no_key", reply: "The assistant needs an ANTHROPIC_API_KEY secret in Supabase." }, 500);
    const { message, context, history } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "no_message" }, 400);
    const msgs = [
      ...((history ?? []) as { role: string; content: string }[]).slice(-6).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content).slice(0, 2000) })),
      { role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}. The run the user is looking at: ${context?.current_run_id ?? "none"}.\n\nDATA:\n${JSON.stringify(context).slice(0, 150000)}\n\nREQUEST: ${message}` },
    ];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, tools: [TOOL], messages: msgs }),
    });
    const out = await r.json();
    if (!r.ok) return json({ error: "claude_error", reply: out?.error?.message ?? "Claude couldn't be reached." }, 502);
    const tool = (out.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
    if (tool) return json({ reply: tool.input.reply || text, ops: tool.input.ops ?? [], warnings: tool.input.warnings ?? [] });
    return json({ reply: text || "I didn't understand that – could you say it another way?", ops: [] });
  } catch (e) {
    return json({ error: "server_error", reply: String(e) }, 500);
  }
});
