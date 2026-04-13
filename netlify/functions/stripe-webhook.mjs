import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Stripe webhook handler – listens for checkout.session.completed events
 * and sends a branded donation thank-you email via Resend.
 */
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  let event;

  // If a Stripe webhook secret is configured, verify the signature
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }
    // Stripe signature verification (using the raw body)
    const crypto = await import("node:crypto");
    const parts = Object.fromEntries(
      sig.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k, v];
      })
    );
    const timestamp = parts.t;
    const expectedSig = parts.v1;
    const payload = `${timestamp}.${body}`;
    const computed = crypto
      .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");
    if (computed !== expectedSig) {
      return new Response("Invalid signature", { status: 400 });
    }
  }

  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email;
  const name =
    session.customer_details?.name ||
    session.metadata?.donor_name ||
    "Supporter";
  const amountCents = session.amount_total || 0;
  const amount = (amountCents / 100).toFixed(2);

  if (!email) {
    console.error("No donor email found in session", session.id);
    return new Response(JSON.stringify({ error: "No email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const htmlEmail = buildEmail(name, amount);

  const fromAddress =
    process.env.RESEND_FROM_EMAIL ||
    "Holden Foundation <donations@holdenfoundation.org>";

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: `Thank you for your $${amount} donation, ${name}!`,
    html: htmlEmail,
  });

  if (error) {
    console.error("Resend error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Email sent successfully:", data?.id);

  return new Response(JSON.stringify({ sent: true, emailId: data?.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  path: "/api/stripe-webhook",
};

/* ── Branded HTML email matching the website's dark design ── */
function buildEmail(name, amount) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Thank You for Your Donation</title>
</head>
<body style="margin:0;padding:0;background-color:#060918;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f8fafc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#060918;">
<tr><td align="center" style="padding:40px 16px;">

  <!-- Main container -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0a0e2a;border-radius:16px;overflow:hidden;border:1px solid rgba(245,200,66,0.15);">

    <!-- Header / Logo bar -->
    <tr>
      <td style="background:linear-gradient(135deg,#f5c842 0%,#f97316 100%);padding:28px 32px;text-align:center;">
        <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;font-weight:800;letter-spacing:3px;color:#0a0e2a;text-transform:uppercase;">
          HFKS <span style="color:#38bdf8;">Foundation</span>
        </h1>
        <p style="margin:6px 0 0;font-size:12px;letter-spacing:2px;color:rgba(10,14,42,0.6);text-transform:uppercase;">
          Holden Foundation for Kids Sports
        </p>
      </td>
    </tr>

    <!-- Body content -->
    <tr>
      <td style="padding:40px 32px 24px;">
        <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#38bdf8;font-weight:700;">
          Donation Confirmed
        </p>
        <h2 style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:32px;font-weight:800;letter-spacing:1px;color:#f8fafc;line-height:1.1;">
          Thank You, ${escapeHtml(name)}!
        </h2>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#94a3b8;">
          Your generous donation of <strong style="color:#f5c842;font-size:20px;">$${escapeHtml(amount)}</strong> has been received. Every dollar goes directly toward giving kids access to sports programs, scholarships, and mentorship they deserve.
        </p>
      </td>
    </tr>

    <!-- Impact highlight -->
    <tr>
      <td style="padding:0 32px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#111630,#0d1440);border:1px solid rgba(245,200,66,0.2);border-radius:12px;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 12px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#38bdf8;font-weight:700;">
                Your Impact
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:8px;">
                    <p style="margin:0;font-size:36px;font-weight:800;color:#f5c842;line-height:1;">500+</p>
                    <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;">Kids Served</p>
                  </td>
                  <td width="33%" style="text-align:center;padding:8px;">
                    <p style="margin:0;font-size:36px;font-weight:800;color:#f5c842;line-height:1;">12</p>
                    <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;">Programs</p>
                  </td>
                  <td width="33%" style="text-align:center;padding:8px;">
                    <p style="margin:0;font-size:36px;font-weight:800;color:#f5c842;line-height:1;">93%</p>
                    <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;">Grade Improvement</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:0 32px 32px;text-align:center;">
        <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;line-height:1.6;">
          Want to make an even bigger impact? Share our mission or explore other ways to get involved.
        </p>
        <a href="https://holdenfoundationforkidsports.netlify.app/#involved" style="display:inline-block;background:#f5c842;color:#0a0e2a;padding:14px 32px;border-radius:6px;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">
          Get Involved
        </a>
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td style="padding:0 32px;">
        <div style="height:1px;background:rgba(255,255,255,0.06);"></div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:24px 32px 32px;text-align:center;">
        <p style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:3px;color:#f5c842;text-transform:uppercase;">
          Holden Foundation <span style="color:#38bdf8;">for Kids Sports</span>
        </p>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
          Peachtree Corners, GA &nbsp;|&nbsp; info@holdenfoundation.org
        </p>
        <p style="margin:12px 0 0;font-size:11px;color:rgba(148,163,184,0.5);">
          &copy; 2026 Holden Foundation for Kids Sports. 501(c)(3) Nonprofit.<br/>
          This receipt may be used for tax-deduction purposes.
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
