import os
import resend
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
resend.api_key = os.getenv("RESEND_API_KEY", "")

FROM_ADDRESS = "URBN Pipeline <onboarding@resend.dev>"

# All pipeline notification emails go to these recipients.
NOTIFY_RECIPIENTS = [
    "samarthpande68@gmail.com",
    "yash@acetron.in",
    "product@acetron.in",
]


def _fmt_date(dt) -> str:
    if not dt:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except Exception:
            return dt
    return dt.strftime("%d %B %Y, %I:%M %p")


def _row(label: str, value: str | None) -> str:
    if not value:
        return ""
    return f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:170px;vertical-align:top;">{label}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">{value}</td>
        </tr>"""


def _render(
    *,
    header_title: str,
    header_bg: str,
    intro_html: str,
    product_name: str,
    factory: str | None,
    badge_label: str | None,
    badge_color: str | None,
    rows: list[str],
    cta_label: str | None,
    cta_body: str | None,
    cta_bg: str = "#f8fafc",
    cta_border: str = "#e2e8f0",
    cta_color: str = "#334155",
) -> str:
    badge = ""
    if badge_label and badge_color:
        badge = (
            f'<div style="margin-top:12px;"><span style="display:inline-block;'
            f'background:{badge_color}20;color:{badge_color};border:1px solid {badge_color}40;'
            f'border-radius:4px;padding:3px 10px;font-size:12px;font-weight:600;">{badge_label}</span></div>'
        )
    rows_html = "".join(rows)
    table = (
        f'<table width="100%" cellpadding="0" cellspacing="0" '
        f'style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">{rows_html}</table>'
        if rows_html
        else ""
    )
    cta = ""
    if cta_body:
        cta = (
            f'<div style="background:{cta_bg};border:1px solid {cta_border};border-radius:8px;padding:20px 24px;margin-bottom:28px;">'
            f'<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:{cta_color};text-transform:uppercase;letter-spacing:0.05em;">{cta_label}</p>'
            f'<p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">{cta_body}</p></div>'
        )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:{header_bg};border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">URBN Internal Pipeline</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;color:#ffffff;">{header_title}</h1>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          {intro_html}
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:600;color:#0f172a;">{product_name}</p>
            <p style="margin:0;font-size:13px;color:#64748b;">Factory: {factory or "—"}</p>
            {badge}
          </div>
          {table}
          {cta}
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
            This is an automated notification from the URBN internal pipeline system. Do not reply to this email.
          </p>
        </td></tr>
        <tr><td style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">URBN Internal · Product Pipeline Tracker</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send(subject: str, html: str, recipients: list[str] | None = None):
    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": recipients or NOTIFY_RECIPIENTS,
            "subject": subject,
            "html": html,
        })
    except Exception as e:
        print(f"[email] Failed to send '{subject}': {e}")


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
    intro = (
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">Dear Team,</p>'
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">'
        'The following product has been marked as <strong style="color:#dc2626;">Rejected</strong> '
        'in the URBN pipeline. Please review the details below and confirm the decision.</p>'
    )
    rows = [
        _row("NPD Observations", f'<span style="font-style:italic;">"{npd_notes}"</span>' if npd_notes else None),
        _row("Decision Feedback", f'<span style="font-style:italic;">"{verdict_remarks}"</span>' if verdict_remarks else None),
        _row("Rejected By", rejected_by),
        _row("Rejected At", _fmt_date(rejected_at) if rejected_at else None),
    ]
    html = _render(
        header_title="Product Rejection Notice",
        header_bg="#0f172a",
        intro_html=intro,
        product_name=product_name,
        factory=factory,
        badge_label=f"NPD: {npd_outcome or '—'}",
        badge_color="#dc2626" if npd_outcome == "Fail" else "#16a34a",
        rows=rows,
        cta_label="Action Required",
        cta_body="Please log in to the URBN dashboard to confirm this rejection — you may archive the product or send it back to On Hold for further review.",
        cta_bg="#fef2f2",
        cta_border="#fecaca",
        cta_color="#dc2626",
    )
    _send(f"[Action Required] Product Rejected — {product_name}", html)


def send_product_added_email(
    product_name: str,
    factory: str | None,
    priority: str | None,
    deadline: str | None,
    created_by: str | None,
):
    intro = (
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">Dear Team,</p>'
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">'
        'A new product has been added to the URBN pipeline and is now pending NPD testing.</p>'
    )
    rows = [
        _row("Priority", priority),
        _row("Deadline", _fmt_date(deadline) if deadline else None),
        _row("Added By", created_by),
    ]
    html = _render(
        header_title="New Product Added",
        header_bg="#1d4ed8",
        intro_html=intro,
        product_name=product_name,
        factory=factory,
        badge_label="Pending NPD",
        badge_color="#2563eb",
        rows=rows,
        cta_label=None,
        cta_body=None,
    )
    _send(f"New Product Added — {product_name}", html)


def send_product_approved_email(
    product_name: str,
    factory: str | None,
    approved_by: str | None,
    remarks: str | None,
):
    intro = (
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">Dear Team,</p>'
        '<p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">'
        'The following product has been <strong style="color:#16a34a;">Approved</strong> in the URBN '
        'pipeline and is moving forward to order placement.</p>'
    )
    rows = [
        _row("Approved By", approved_by),
        _row("Remarks", f'<span style="font-style:italic;">"{remarks}"</span>' if remarks else None),
    ]
    html = _render(
        header_title="Product Approved",
        header_bg="#065f46",
        intro_html=intro,
        product_name=product_name,
        factory=factory,
        badge_label="Approved",
        badge_color="#16a34a",
        rows=rows,
        cta_label="Next Step",
        cta_body="This product is now awaiting order placement before moving to the Golden Sample stage.",
        cta_bg="#f0fdf4",
        cta_border="#bbf7d0",
        cta_color="#16a34a",
    )
    _send(f"Product Approved — {product_name}", html)
