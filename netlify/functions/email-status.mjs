import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Retrieve the status of a sent email by its Resend ID.
 * GET /api/email-status?id=re_xxxxx
 */
export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const emailId = url.searchParams.get("id");

  if (!emailId || !emailId.startsWith("re_")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid email ID. Must start with re_" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { data, error } = await resend.emails.get(emailId);

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        id: data.id,
        to: data.to,
        subject: data.subject,
        created_at: data.created_at,
        last_event: data.last_event,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Failed to fetch email status:", err);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve email status" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/email-status",
};
