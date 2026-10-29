"""Pages a client opens from our emails, served by the API itself.

The website sits behind a login (Amplify basic auth), so a client clicking the link in an address-confirmation
email would hit a password prompt. These pages live on the API host instead: plain HTML, no script, one form.
The link's token is the only key; the page shows the order subject and the address on file, nothing else.
"""
from html import escape

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.api.security import limiter
from app.config import get_settings
from app.desk import address_book
from app.desk.pipeline import AlreadyApproved, process_message

router = APIRouter(prefix="/c", include_in_schema=False)

# No script at all; the token is in the URL, so never pass it on as a referrer, and never index the page.
_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
                               "frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
}

_STYLE = """
*{box-sizing:border-box}body{margin:0;background:#F3F5F4;color:#15212B;
font:16px/1.5 Barlow,system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:480px;margin:0 auto;padding:40px 16px}
.brand{margin:0 0 24px;font-size:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#5E6B75}
.panel{background:#fff;border:1px solid #D9DFDD;border-radius:8px;padding:24px}
h1{margin:0 0 4px;font-size:20px;font-weight:600}p{margin:0;color:#3A4852;font-size:15px}
.addr{margin:16px 0 0;padding:12px 16px;border:1px solid #D9DFDD;border-radius:6px;background:#F3F5F4;
font-style:normal;font-size:15px;line-height:1.6}
button{margin-top:20px;width:100%;min-height:44px;border:0;border-radius:6px;background:#0E6B63;color:#fff;
font:inherit;font-weight:600;cursor:pointer}button:hover{background:#0A524C}
button:focus-visible{outline:3px solid #15212B;outline-offset:2px}
.note{margin-top:16px;font-size:14px;color:#5E6B75}.done{color:#0E6B63;font-weight:600;margin-bottom:8px}
"""


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    html = (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f"<title>{escape(title)} · Halcyon Logistics</title><style>{_STYLE}</style></head>"
            f'<body><main><p class="brand">Halcyon Logistics</p><div class="panel">{body}</div></main></body></html>')
    return HTMLResponse(html, status_code=status, headers=_HEADERS)


def _not_found() -> HTMLResponse:
    return _page("Link not valid", "<h1>This link is not valid</h1><p>Please reply to our email and we will help "
                                   "you with your order.</p>", 404)


@router.get("/confirm-address/{token}")
def confirm_page(token: str):
    v = address_book.confirmation_view(token)
    if v is None:
        return _not_found()
    subject = escape(v["subject"] or "your order")
    if v["status"] in ("confirmed", "corrected"):
        return _page("Address confirmed", f'<p class="done">&#10003; Confirmed</p><h1>Thank you, the address is '
                     f"confirmed</h1><p>We are putting your order ({subject}) through now and will email you the "
                     "delivery date.</p>")
    a = v["address"] or {}
    site = f"<strong>{escape(v['site_name'])}</strong><br>" if v.get("site_name") else ""
    addr = (f'<address class="addr">{site}{escape(a.get("street") or "")}<br>{escape(a.get("city") or "")}, '
            f'{escape(a.get("state") or "")} {escape(a.get("postcode") or "")}</address>') if a else ""
    return _page("Confirm the delivery address",
                 f"<h1>Please confirm the delivery address</h1><p>For your order <strong>{subject}</strong>. "
                 f"We have delivered here for you before.</p>{addr}"
                 f'<form method="post"><button type="submit">Yes, deliver to this address</button></form>'
                 '<p class="note">Not right? Reply to our email with the correct address and we will update the '
                 "order.</p>")


@router.post("/confirm-address/{token}")
def confirm_submit(token: str, request: Request):
    s = get_settings()
    if s.agent_rate_limit_per_min > 0:
        allowed, _ = limiter.allow(request.client.host if request.client else "unknown", s.agent_rate_limit_per_min)
        if not allowed:
            return _page("Please wait", "<h1>Please try again in a minute</h1><p>Too many requests from this "
                                        "address.</p>", 429)
    try:
        mid = address_book.confirm_by_link(token)
    except address_book.ConfirmationNotFound:
        return _not_found()
    try:
        process_message(mid)  # the order is processed again with the confirmed address
    except AlreadyApproved:
        pass
    # Post, then redirect: a refresh does not resend the form.
    return RedirectResponse(f"/c/confirm-address/{token}", status_code=303, headers=_HEADERS)
