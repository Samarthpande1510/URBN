import os
import resend
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
resend.api_key = os.getenv("RESEND_API_KEY", "")

FROM_ADDRESS = "URBN Pipeline <onboarding@resend.dev>"


def _fmt_date(dt) -> str:
    if not dt:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except Exception:
            return dt
    return dt.strftime("%d %B %Y, %I:%M %p")


def send_rejection_email(
    ceo_email: str,
    ceo_name: str,
    product_name: str,
    factory: str | None,
    npd_outcome: str | None,
    npd_notes: str | None,
    verdict_remarks: str | None,
    rejected_by: str | None,
    rejected_at: str | None,
):
    outcome_color = "#dc2626" if npd_outcome == "Fail" else "#16a34a"
    outcome_label = npd_outcome or "—"

    rows = ""
    if npd_notes:
        rows += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:170px;vertical-align:top;">NPD Observations</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-style:italic;">"{npd_notes}"</td>
        </tr>"""
    if verdict_remarks:
        rows += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;vertical-align:top;">Decision Feedback</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-style:italic;">"{verdict_remarks}"</td>
        </tr>"""
    if rejected_by:
        rows += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">Rejected By</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">{rejected_by}</td>
        </tr>"""
    if rejected_at:
        rows += f"""
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;">Rejected At</td>
          <td style="padding:10px 14px;font-size:13px;color:#0f172a;">{_fmt_date(rejected_at)}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">URBN Internal Pipeline</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;color:#ffffff;">Product Rejection Notice</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
            Dear {ceo_name},
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
            The following product has been marked as <strong style="color:#dc2626;">Rejected</strong> in the URBN pipeline. Please review the details below and confirm your decision.
          </p>

          <!-- Product summary -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:600;color:#0f172a;">{product_name}</p>
            <p style="margin:0;font-size:13px;color:#64748b;">Factory: {factory or "—"}</p>
            <div style="margin-top:12px;">
              <span style="display:inline-block;background:{outcome_color}20;color:{outcome_color};border:1px solid {outcome_color}40;border-radius:4px;padding:3px 10px;font-size:12px;font-weight:600;">
                NPD: {outcome_label}
              </span>
            </div>
          </div>

          <!-- Details table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            {rows}
          </table>

          <!-- CTA -->
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em;">Action Required</p>
            <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
              Please log in to the URBN dashboard to confirm this rejection — you may archive the product or send it back to On Hold for further review.
            </p>
          </div>

          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
            This is an automated notification from the URBN internal pipeline system. Do not reply to this email.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">URBN Internal · Product Pipeline Tracker</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": [ceo_email],
            "subject": f"[Action Required] Product Rejected — {product_name}",
            "html": html,
        })
    except Exception as e:
        print(f"[email] Failed to send rejection email: {e}")
