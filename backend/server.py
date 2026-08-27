from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_async_client, AsyncClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import httpx
import hmac
import hashlib
import json
import random
import string
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Supabase connection (safely read env variables to prevent crashing on import)
supabase_url = os.environ.get('SUPABASE_URL', '')
supabase_key = os.environ.get('SUPABASE_KEY', '')

# Config
PAYSTACK_SECRET_KEY = os.environ.get('PAYSTACK_SECRET_KEY', '')

# Moolre Config
MOOLRE_USERNAME = os.environ.get('MOOLRE_USERNAME', '')
MOOLRE_PUBLIC_KEY = os.environ.get('MOOLRE_PUBLIC_KEY', '')
MOOLRE_PRIVATE_KEY = os.environ.get('MOOLRE_PRIVATE_KEY', '')
MOOLRE_ACCOUNT_NUMBER = os.environ.get('MOOLRE_ACCOUNT_NUMBER', '')
MOOLRE_BUSINESS_EMAIL = os.environ.get('MOOLRE_BUSINESS_EMAIL', 'reservations@kadelgh.com')
MOOLRE_BASE_URL = 'https://api.moolre.com'

# Security & Admin Access Control Config
ADMIN_EMAILS = [
    e.strip().lower() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()
]

# Simple in-memory sliding window rate limiter for public sensitive endpoints
import time
from collections import defaultdict

_rate_limit_records = defaultdict(list)

def check_rate_limit(key: str, max_requests: int = 30, window_seconds: int = 60) -> bool:
    """Returns True if within rate limit, False if rate limit exceeded"""
    now = time.time()
    cutoff = now - window_seconds
    # Clean old requests
    _rate_limit_records[key] = [t for t in _rate_limit_records[key] if t > cutoff]
    if len(_rate_limit_records[key]) >= max_requests:
        return False
    _rate_limit_records[key].append(now)
    return True

TRUSTED_PROXIES = {
    ip.strip()
    for ip in os.environ.get('TRUSTED_PROXIES', '127.0.0.1,::1,localhost').split(',')
    if ip.strip()
}

def get_client_ip(request: Request) -> str:
    peer_ip = request.client.host if request.client else "127.0.0.1"
    # Only trust X-Forwarded-For if peer host is explicitly a recognized reverse proxy
    if peer_ip in TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Rightmost untrusted proxy position / client IP
            return forwarded.split(",")[0].strip()
    return peer_ip

def sanitize_callback_url(client_url: Optional[str]) -> str:
    """Validate and sanitize payment callback URL to prevent open redirect and parameter tampering"""
    default_frontend = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    default_callback = f"{default_frontend}/payment/callback"
    if not client_url or not isinstance(client_url, str):
        return default_callback
    
    try:
        from urllib.parse import urlparse
        parsed = urlparse(client_url.strip())
        if not parsed.scheme or not parsed.netloc:
            return default_callback
            
        allowed_hosts = {"localhost:3000", "127.0.0.1:3000", "kadelgh.com", "www.kadelgh.com"}
        frontend_host = urlparse(default_frontend).netloc
        if frontend_host:
            allowed_hosts.add(frontend_host)
            
        if parsed.netloc.lower() in allowed_hosts:
            # Safe domain match
            return client_url.strip()
    except Exception:
        pass
    return default_callback

TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '')

async def verify_turnstile_token(token: Optional[str], client_ip: str) -> bool:
    """Validate Cloudflare Turnstile bot protection token if secret key is configured"""
    if not TURNSTILE_SECRET_KEY:
        # Non-enforcing mode when secret is not configured
        return True
    if not token or not isinstance(token, str):
        return False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": TURNSTILE_SECRET_KEY,
                    "response": token,
                    "remoteip": client_ip
                },
                timeout=5
            )
            return res.json().get("success", False)
    except Exception as e:
        logger.error(f"Turnstile verification error: {e}")
        return False

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class BookingSelection(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    # unit_price and subtotal provided by client are ignored server-side;
    # the backend always re-fetches prices from the DB to prevent price manipulation.
    unit_price: float
    subtotal: float

class BookingCreate(BaseModel):
    graduate_name: str
    course: str
    graduation_date: str
    phone: str
    email: str
    attendees_count: int = Field(..., ge=1, description="Number of attendees, must be at least 1")
    wants_food: bool
    selections: List[BookingSelection] = []

class LeadCreate(BaseModel):
    full_name: str
    email: str
    phone: str
    institution: str
    course: Optional[str] = ""
    estimated_guests: int = Field(default=10, ge=1)
    expected_graduation_period: Optional[str] = ""
    notes: Optional[str] = ""

class LeadStatusUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class AdminLoginReq(BaseModel):
    email: str
    password: str

class ProductCreate(BaseModel):
    name: str
    category: str
    price: float = Field(..., ge=0, description="Price must be non-negative")
    stock: int = Field(..., ge=0, description="Stock must be non-negative")
    vendor: str = ""
    is_active: bool = True



class TableAssign(BaseModel):
    booking_id: str
    # Optional to allow clearing a table assignment (set to null)
    table_number: Optional[str] = None

class PaymentInit(BaseModel):
    booking_id: str
    callback_url: str
    booking_secret: Optional[str] = None

# ==================== HELPERS ====================

def generate_reservation_code():
    # Cryptographically secure random code generation (base32 unambiguous alphabet, 8 chars: ~1.1 trillion permutations)
    prefix = "KAD-"
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    token = ''.join(secrets.choice(alphabet) for _ in range(8))
    return f"{prefix}{token}"

def generate_lead_code():
    prefix = "LEAD-"
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    token = ''.join(secrets.choice(alphabet) for _ in range(6))
    return f"{prefix}{token}"

def serialize_doc(doc):
    if doc is None:
        return None
    result = dict(doc)
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result

def mask_email(email: str) -> str:
    """Mask email address to prevent mass PII scraping in public lookups"""
    if not email or "@" not in email:
        return email or ""
    parts = email.split("@", 1)
    name, domain = parts[0], parts[1]
    if len(name) <= 2:
        masked_name = name[0] + "*" if name else "*"
    else:
        masked_name = name[0] + ("*" * (len(name) - 2)) + name[-1]
    return f"{masked_name}@{domain}"

def mask_phone(phone: str) -> str:
    """Mask phone number to prevent mass PII scraping in public lookups"""
    if not phone:
        return ""
    digits = [c for c in phone if c.isdigit()]
    if len(digits) <= 4:
        return phone
    clean = "".join(digits)
    prefix = clean[:3]
    suffix = clean[-3:]
    masked_middle = "*" * (len(clean) - 6) if len(clean) > 6 else "***"
    return f"{prefix}{masked_middle}{suffix}"

async def get_current_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth.split(" ")[1]
    try:
        res = await supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(401, "Invalid token")
            
        user_email = (res.user.email or "").strip().lower()
        user_role = ""
        if res.user.app_metadata and isinstance(res.user.app_metadata, dict):
            user_role = res.user.app_metadata.get("role", "")
        if not user_role and res.user.user_metadata and isinstance(res.user.user_metadata, dict):
            user_role = res.user.user_metadata.get("role", "")

        # Check configured admin emails if specified
        admin_emails_raw = os.environ.get('ADMIN_EMAILS', '').strip()
        admin_emails = [e.strip().lower() for e in admin_emails_raw.split(',') if e.strip()]

        if admin_emails:
            is_admin = user_role == "admin" or user_email in admin_emails
        else:
            # When ADMIN_EMAILS is not configured, any authenticated Supabase user is granted admin access
            is_admin = True

        if not is_admin:
            logger.warning(f"Unauthorized admin access attempt by user: {user_email}")
            raise HTTPException(403, "Access forbidden: administrator privileges required")

        return {"email": res.user.email, "id": res.user.id, "role": "admin"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_current_admin auth error: {e}")
        raise HTTPException(401, "Invalid token")

async def auto_assign_table(graduation_date: str):
    # FIX: Order by the numeric value of the table number (not by created_at)
    # so we always increment from the highest assigned number rather than the
    # most recently created booking. Using created_at ordering could return T3
    # while T15 already exists, causing a table number collision.
    res = await supabase.table("bookings").select("table_number").eq("graduation_date", graduation_date).not_.is_("table_number", "null").execute()
    if res.data:
        max_num = 0
        for row in res.data:
            raw = row.get("table_number", "")
            if raw:
                try:
                    num = int(str(raw).replace("T", ""))
                    if num > max_num:
                        max_num = num
                except (ValueError, AttributeError):
                    pass
        if max_num > 0:
            return f"T{max_num + 1}"
    return "T1"


async def adjust_product_stock(product_id: str, amount: int):
    # Guard against stock going negative and prevent race conditions using Optimistic Concurrency Control (OCC) retry loop.
    max_retries = 5
    for attempt in range(max_retries):
        res = await supabase.table("products").select("stock, name").eq("id", product_id).execute()
        if not res.data:
            logger.warning(f"Product {product_id} not found for stock adjustment")
            return False
        product_data = res.data[0]
        current = product_data.get("stock", 0)
        new_stock = current + amount
        if new_stock < 0:
            logger.error(
                f"Insufficient stock for product {product_id} ('{product_data.get('name')}') to satisfy adjustment: "
                f"current={current}, requested adjustment={amount}."
            )
            return False
            
        update_res = await supabase.table("products").update({"stock": new_stock})\
            .eq("id", product_id)\
            .eq("stock", current)\
            .execute()
        if update_res.data:
            return True
        logger.info(f"OCC retry for product {product_id} stock adjustment (attempt {attempt + 1})")
        
    logger.error(f"Failed to adjust stock for product {product_id} after {max_retries} attempts due to high concurrency")
    return False


async def send_confirmation_email(booking):
    """Send email confirmation using Resend API, falling back to SMTP if configured"""
    resend_key = os.environ.get('RESEND_API_KEY', '')
    resend_from = os.environ.get('RESEND_FROM_EMAIL', 'reservations@kadelgh.com')
    
    if resend_from:
        resend_from = resend_from.strip().strip('\'"')
        
    if not resend_from:
        resend_from = "reservations@kadelgh.com"

    # If it is a bare domain (no @ sign), prepend reservations@
    if "@" not in resend_from:
        resend_from = f"reservations@{resend_from}"

    # Handle standard parsing cleanups to format clean 'Name <email>' strings
    if "<" in resend_from and ">" in resend_from:
        parts = resend_from.split("<")
        name = parts[0].strip().strip('\'"')
        email = parts[1].replace(">", "").strip().strip('\'"')
        if name:
            resend_from = f"{name} <{email}>"
        else:
            resend_from = email
    elif "@" in resend_from and "<" not in resend_from:
        resend_from = f"KaDel Ghana <{resend_from}>"

    graduate_name = booking.get('graduate_name', 'Graduate')
    reservation_code = booking.get('reservation_code', 'N/A')
    table_number = booking.get('table_number')
    program = booking.get('course', 'Graduation Program')
    graduation_date = booking.get('graduation_date', 'N/A')
    attendees_count = booking.get('attendees_count', 0)
    total_amount = booking.get('total_amount', 0.0)
    
    table_val = table_number if table_number else 'Pending Assignment'
    table_val_plain = table_number if table_number else 'Pending Assignment'
    
    status_label = booking.get('status', 'confirmed').capitalize()
    status_bg = "#e6f6ec" if booking.get('status') == 'confirmed' else "#fef3c7"
    status_color = "#0d8a43" if booking.get('status') == 'confirmed' else "#b45309"

    # Calculate itemized breakdown
    event_fee = booking.get('event_fee') or (total_amount - booking.get('catering_fee', 0.0))
    if event_fee < 0:
        event_fee = 0.0
    
    charged_guests = ((attendees_count + 9) // 10) * 10 if attendees_count > 0 else 0
    rate_per_guest = (event_fee / charged_guests) if charged_guests > 0 else 0.0

    selections = booking.get("selections", [])
    
    # HTML cost breakdown rows
    breakdown_html = f"""
          <tr class="table-row">
            <td class="table-label" style="padding: 12px 0; font-size: 15px; color: #86868b; font-weight: 400; text-align: left; width: 60%;">
              Table Reservation Fee<br>
              <span style="font-size: 12px; color: #86868b;">Charged for {charged_guests} guests @ GHC {rate_per_guest:.2f} / guest</span>
            </td>
            <td class="table-value" style="padding: 12px 0; font-size: 15px; color: #1d1d1f; font-weight: 600; text-align: right; vertical-align: top;">GHC {event_fee:.2f}</td>
          </tr>
    """

    breakdown_plain = f"  Table Reservation Fee (Charged for {charged_guests} guests @ GHC {rate_per_guest:.2f} / guest): GHC {event_fee:.2f}"

    if booking.get("wants_food") and selections:
        for item in selections:
            name = item.get('product_name', '')
            qty = item.get('quantity', 0)
            price = item.get('unit_price', 0.0)
            sub = item.get('subtotal', 0.0)
            breakdown_html += f"""
          <tr class="table-row">
            <td class="table-label" style="padding: 12px 0; font-size: 15px; color: #86868b; font-weight: 400; text-align: left; width: 60%;">
              {name}<br>
              <span style="font-size: 12px; color: #86868b;">Quantity: {qty} @ GHC {price:.2f} each</span>
            </td>
            <td class="table-value" style="padding: 12px 0; font-size: 15px; color: #1d1d1f; font-weight: 600; text-align: right; vertical-align: top;">GHC {sub:.2f}</td>
          </tr>
            """
            breakdown_plain += f"\n  {name} (Quantity: {qty} @ GHC {price:.2f} each): GHC {sub:.2f}"

    breakdown_html += f"""
          <tr class="table-row" style="border-top: 1px solid #1d1d1f; border-bottom: none;">
            <td class="table-label" style="padding: 16px 0; font-size: 15px; color: #1d1d1f; font-weight: 700; text-align: left;">Total Amount Paid</td>
            <td class="table-value" style="padding: 16px 0; font-size: 18px; color: #1d1d1f; font-weight: 800; text-align: right;">GHC {total_amount:.2f}</td>
          </tr>
    """
        
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Reservation is Confirmed</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #ffffff;
      color: #1d1d1f;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }}
    .wrapper {{
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
    }}
    .header {{
      padding: 0 0 40px 0;
      border-bottom: 1px solid #f5f5f7;
    }}
    .brand {{
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: #1d1d1f;
      text-decoration: none;
    }}
    .content {{
      padding: 40px 0;
    }}
    .title {{
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
      line-height: 1.15;
      color: #1d1d1f;
      margin-top: 0;
      margin-bottom: 24px;
    }}
    .greeting {{
      font-size: 17px;
      line-height: 1.5;
      font-weight: 600;
      color: #1d1d1f;
      margin-bottom: 12px;
    }}
    .lead-text {{
      font-size: 17px;
      line-height: 1.5;
      color: #86868b;
      margin-bottom: 32px;
    }}
    .table-container {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }}
    .table-row {{
      border-bottom: 1px solid #f5f5f7;
    }}
    .table-row:last-child {{
      border-bottom: none;
    }}
    .table-label {{
      padding: 14px 0;
      font-size: 15px;
      color: #86868b;
      font-weight: 400;
      text-align: left;
      width: 40%;
    }}
    .table-value {{
      padding: 14px 0;
      font-size: 15px;
      color: #1d1d1f;
      font-weight: 600;
      text-align: right;
    }}
    .reservation-code-wrapper {{
      background-color: #f5f5f7;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 32px;
    }}
    .code-label {{
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #86868b;
      margin-bottom: 8px;
      display: block;
    }}
    .code-value {{
      font-family: -apple-system, SFMono-Regular, Consolas, monospace;
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #1d1d1f;
    }}
    .badge-status {{
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }}
    .footer {{
      padding: 40px 0 0 0;
      border-top: 1px solid #f5f5f7;
      font-size: 12px;
      line-height: 1.6;
      color: #86868b;
    }}
    .footer a {{
      color: #0066cc;
      text-decoration: none;
    }}
    .footer a:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="brand">KaDel</span>
      </div>
      <div class="content">
        <h2 class="title">Your table is ready.</h2>
        <div class="greeting">Hi {graduate_name},</div>
        <p class="lead-text">
          Congratulations on your graduation. Your table reservation for the graduation event has been confirmed. Below you'll find the details for your event.
        </p>

        <div class="reservation-code-wrapper">
          <span class="code-label">Reservation Code</span>
          <span class="code-value">{reservation_code}</span>
        </div>

        <table class="table-container" style="margin-bottom: 24px;">
          <tr class="table-row">
            <td class="table-label">Table Number</td>
            <td class="table-value">{table_val}</td>
          </tr>
          <tr class="table-row">
            <td class="table-label">Status</td>
            <td class="table-value"><span class="badge-status" style="background-color: {status_bg}; color: {status_color};">{status_label}</span></td>
          </tr>
          <tr class="table-row">
            <td class="table-label">Program</td>
            <td class="table-value">{program}</td>
          </tr>
          <tr class="table-row">
            <td class="table-label">Graduation Date</td>
            <td class="table-value">{graduation_date}</td>
          </tr>
        </table>

        <h4 style="font-size: 11px; font-weight: 700; color: #86868b; margin-top: 24px; margin-bottom: 12px; letter-spacing: 0.5px; text-transform: uppercase;">Cost Breakdown</h4>
        <table class="table-container">
          {breakdown_html}
        </table>

        <p class="lead-text" style="margin-bottom: 0;">
          If you have any questions or need to make changes, please don't hesitate to reach out to us at <a href="mailto:reservations@kadelgh.com" style="color: #0066cc; text-decoration: none;">reservations@kadelgh.com</a>.
        </p>
      </div>
      <div class="footer">
        <p>This email confirms your reservation details. Please keep your reservation code handy for check-in on the day of the event.</p>
        <p style="margin-top: 16px;">
          KaDel Ghana, Accra, Ghana.
        </p>
      </div>
    </div>
  </div>
</body>
</html>"""

    plain_content = f"""Dear {graduate_name},

Your graduation table reservation has been confirmed!

Reservation Details:
  Reservation Code: {reservation_code}
  Table Number: {table_val_plain}
  Program: {program}
  Graduation Date: {graduation_date}

Cost Breakdown:
{breakdown_plain}

Please save your reservation code for check-in.

Congratulations on your graduation!

- KaDel Ghana"""

    if resend_key:
        try:
            async with httpx.AsyncClient() as http_client:
                headers = {
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "from": resend_from,
                    "to": [booking['email']],
                    "subject": f"Graduation Reservation Confirmed - {reservation_code}",
                    "html": html_content,
                    "text": plain_content
                }
                res = await http_client.post("https://api.resend.com/emails", json=payload, headers=headers)
                if res.status_code in [200, 201]:
                    logger.info(f"Confirmation email sent via Resend to {booking['email']}")
                    return True
                else:
                    logger.error(f"Resend email failed (Status {res.status_code}): {res.text}")
        except Exception as e:
            logger.error(f"Error sending email via Resend: {e}")

    # SMTP Fallback
    smtp_host = os.environ.get('SMTP_HOST', '')
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    
    if not smtp_host or not smtp_user:
        logger.info(f"Email service not configured. Confirmation for {reservation_code} logged only.")
        return False
        
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart('alternative')
        msg['From'] = smtp_user
        msg['To'] = booking['email']
        msg['Subject'] = f"Graduation Reservation Confirmed - {reservation_code}"
        
        msg.attach(MIMEText(plain_content, 'plain'))
        msg.attach(MIMEText(html_content, 'html'))
        
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Confirmation email sent via SMTP fallback to {booking['email']}")
        return True
    except Exception as e:
        logger.error(f"SMTP Fallback email send failed: {e}")
        return False


async def send_lead_confirmation_email(lead):
    """Send priority waitlist confirmation email using Resend API, falling back to SMTP if configured"""
    resend_key = os.environ.get('RESEND_API_KEY', '')
    resend_from = os.environ.get('RESEND_FROM_EMAIL', 'reservations@kadelgh.com')
    
    if resend_from:
        resend_from = resend_from.strip().strip('\'"')
        
    if not resend_from:
        resend_from = "reservations@kadelgh.com"

    if "@" not in resend_from:
        resend_from = f"reservations@{resend_from}"

    if "<" in resend_from and ">" in resend_from:
        parts = resend_from.split("<")
        name = parts[0].strip().strip('\'"')
        email = parts[1].replace(">", "").strip().strip('\'"')
        if name:
            resend_from = f"{name} <{email}>"
        else:
            resend_from = email
    elif "@" in resend_from and "<" not in resend_from:
        resend_from = f"KaDel Ghana <{resend_from}>"

    full_name = lead.get('full_name', 'Graduate')
    lead_code = lead.get('lead_code', 'N/A')
    course = lead.get('course', 'Graduation Program')
    phone = lead.get('phone', 'N/A')
    email_addr = lead.get('email', '')
    estimated_guests = lead.get('estimated_guests', 10)
    
    if not email_addr:
        logger.warning(f"No email address for lead {lead_code}. Skipping confirmation email.")
        return False

    whatsapp_group_url = "https://chat.whatsapp.com/FS08aeTr9zg7zVdUHA66uy?s=sw&p=i&mlu=4&amv=0"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Priority Waitlist Registration</title>
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f7; margin: 0; padding: 20px; color: #1d1d1f; }}
        .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }}
        .kente {{ height: 6px; background: linear-gradient(90deg, #FF3300 0%, #FF3300 33%, #FFCC00 33%, #FFCC00 66%, #009933 66%, #009933 100%); }}
        .content {{ padding: 32px 28px; }}
        .header {{ text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f0f0f5; }}
        .logo {{ font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }}
        .ref-box {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 16px; text-align: center; margin: 24px 0; }}
        .ref-code {{ font-family: monospace; font-size: 24px; font-weight: 900; color: #166534; letter-spacing: 2px; }}
        .details-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        .details-table td {{ padding: 10px 0; border-bottom: 1px solid #f0f0f5; font-size: 14px; }}
        .label {{ color: #6b7280; font-weight: 500; }}
        .val {{ color: #111827; font-weight: 700; text-align: right; }}
        .btn {{ display: block; text-align: center; background: #16a34a; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 14px 20px; border-radius: 12px; margin-top: 20px; font-size: 15px; }}
        .price-box {{ background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-top: 20px; text-align: center; }}
        .footer {{ text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f5; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="kente"></div>
        <div class="content">
          <div class="header">
            <div class="logo">KaDel Ghana</div>
            <p style="margin: 6px 0 0; color: #6b7280; font-size: 14px;">Priority Graduation Waitlist Confirmed</p>
          </div>

          <p style="font-size: 15px; line-height: 1.6; margin-top: 24px;">Hello <strong>{full_name}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">Thank you for registering your table interest! You are officially on the KaDel Priority Graduation Waitlist.</p>

          <div class="ref-box">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #15803d; letter-spacing: 1px;">Your VIP Priority Reference</div>
            <div class="ref-code">{lead_code}</div>
          </div>

          <table class="details-table">
            <tr><td class="label">Graduate Name</td><td class="val">{full_name}</td></tr>
            <tr><td class="label">Course / Program</td><td class="val">{course}</td></tr>
            <tr><td class="label">Expected Guests</td><td class="val">{estimated_guests} Guests</td></tr>
            <tr><td class="label">Phone / WhatsApp</td><td class="val">{phone}</td></tr>
            <tr><td class="label">Status</td><td class="val" style="color: #16a34a;">Priority Registered</td></tr>
          </table>

          <div style="background: #f9fafb; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #111827;">🔔 What happens next?</p>
            <ul style="margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: #4b5563; line-height: 1.5;">
              <li>We track official graduation date releases closely.</li>
              <li>As soon as dates drop, we send an instant SMS & WhatsApp alert to <strong>{phone}</strong>.</li>
              <li>You get priority access to confirm your table selection before public release.</li>
            </ul>
          </div>

          <div class="price-box">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 1px;">Table Reservation Prices</div>
            <div style="margin-top: 8px; font-size: 13px; color: #374151;">
              <strong>1–10 Guests:</strong> GH¢900 &nbsp;|&nbsp; <strong>11–20 Guests:</strong> GH¢1,800
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 6px; font-style: italic;">
              NB: Catering menu options will be available after the official graduation date is released.
            </div>
          </div>

          <a href="{whatsapp_group_url}" class="btn" target="_blank">📱 Join Official WhatsApp Group</a>

          <div class="footer">
            &copy; {datetime.now().year} KaDel Ghana. All rights reserved.<br>
            If you have any questions, reply directly to this email or reach us on WhatsApp.
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    plain_content = f"""KaDel Ghana - Priority Waitlist Registration

Hello {full_name},

Thank you for joining the KaDel Priority Graduation Waitlist!

VIP Priority Code: {lead_code}

Registration Details:
  Graduate Name: {full_name}
  Course / Program: {course}
  Expected Guests: {estimated_guests} Guests
  Phone: {phone}
  Status: Priority Registered

Table Reservation Prices:
  1-10 Guests: GHc900
  11-20 Guests: GHc1,800
  (Catering menu options available after official graduation dates release)

Join our official WhatsApp group: {whatsapp_group_url}

Congratulations on your upcoming graduation!
- KaDel Ghana Team"""

    if resend_key:
        try:
            async with httpx.AsyncClient() as http_client:
                headers = {
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "from": resend_from,
                    "to": [email_addr],
                    "subject": f"🎓 Priority Waitlist Confirmed - Reference: {lead_code}",
                    "html": html_content,
                    "text": plain_content
                }
                res = await http_client.post("https://api.resend.com/emails", json=payload, headers=headers)
                if res.status_code in [200, 201]:
                    logger.info(f"Priority waitlist confirmation email sent via Resend to {email_addr}")
                    return True
                else:
                    logger.error(f"Resend email failed for lead (Status {res.status_code}): {res.text}")
        except Exception as e:
            logger.error(f"Error sending lead confirmation email via Resend: {e}")

    # SMTP Fallback
    smtp_host = os.environ.get('SMTP_HOST', '')
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    
    if not smtp_host or not smtp_user:
        logger.info(f"Email service not configured. Lead confirmation for {lead_code} logged only.")
        return False
        
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart('alternative')
        msg['From'] = smtp_user
        msg['To'] = email_addr
        msg['Subject'] = f"🎓 Priority Waitlist Confirmed - Reference: {lead_code}"
        
        msg.attach(MIMEText(plain_content, 'plain'))
        msg.attach(MIMEText(html_content, 'html'))
        
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Lead confirmation email sent via SMTP fallback to {email_addr}")
        return True
    except Exception as e:
        logger.error(f"SMTP Fallback email send failed for lead: {e}")
        return False


async def send_confirmation_sms(booking):
    """Send SMS confirmation using Arkesel API"""
    sms_key = os.environ.get('SMS_API_KEY', '')
    sms_sender = os.environ.get('SMS_SENDER_ID', 'KaDel')

    if not sms_key:
        logger.warning("SMS API key not set. SMS notification skipped.")
        return

    phone = booking.get('phone', '')
    if not phone:
        logger.warning(f"No phone number on booking {booking.get('id')}. SMS skipped.")
        return

    # Clean the phone number (Ghana Arkesel formats)
    clean_phone = "".join(c for c in phone if c.isdigit())
    if len(clean_phone) == 10 and clean_phone.startswith("0"):
        # Local format: 0XXXXXXXXX → 233XXXXXXXXX
        clean_phone = "233" + clean_phone[1:]
    elif len(clean_phone) == 12 and clean_phone.startswith("233"):
        # Already in international format (233XXXXXXXXX), keep as-is
        pass
    else:
        # Unrecognised format — skip SMS
        logger.warning(f"Unrecognised phone format '{phone}' (cleaned: '{clean_phone}') on booking {booking.get('id')}. SMS skipped.")
        return

    # Final guard: must be exactly 12 digits for Ghana international format
    if len(clean_phone) != 12:
        logger.warning(f"Phone number '{clean_phone}' is not 12 digits after cleaning for booking {booking.get('id')}. SMS skipped.")
        return

    graduate_name = booking.get('graduate_name', 'Graduate')
    reservation_code = booking.get('reservation_code', 'N/A')
    graduation_date = booking.get('graduation_date', 'N/A')
    table_number = booking.get('table_number')
    table_info = f"Table {table_number}" if table_number else "Pending Assignment"

    message = f"Hello {graduate_name}, your table reservation for {graduation_date} is confirmed! Reservation Code: {reservation_code}. Table: {table_info}. Thank you for booking with KaDel."
    
    url = "https://sms.arkesel.com/sms/api"
    params = {
        "action": "send-sms",
        "api_key": sms_key,
        "to": clean_phone,
        "from": sms_sender,
        "sms": message
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, params=params, timeout=10)
            if res.status_code == 200:
                logger.info(f"SMS notification sent successfully to {clean_phone} for booking {reservation_code}.")
            else:
                logger.error(f"Failed to send SMS (Status {res.status_code}): {res.text}")
    except Exception as e:
        logger.error(f"Error calling SMS API: {str(e)}")

# ==================== STARTUP & MIDDLEWARE ====================

supabase: AsyncClient = None

@app.on_event("startup")
async def startup():
    global supabase
    if supabase_url and supabase_key:
        supabase = await create_async_client(supabase_url, supabase_key)
        logger.info("Supabase AsyncClient initialized successfully")
    else:
        logger.error("SUPABASE_URL or SUPABASE_KEY environment variables are missing! Supabase client NOT initialized.")

@app.middleware("http")
async def check_supabase_configured(request: Request, call_next):
    if request.url.path.startswith("/api") and request.url.path not in ["/api", "/api/"]:
        if not supabase_url or not supabase_key or supabase is None:
            return JSONResponse(
                status_code=500,
                content={"detail": "SUPABASE_URL and SUPABASE_KEY environment variables are missing. Please configure them in your Vercel Project Settings."}
            )
    return await call_next(request)

# ==================== PUBLIC ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "KaDel Ghana API"}

@api_router.get("/dates")
async def get_dates():
    res = await supabase.table("graduation_dates").select("*").eq("is_active", True).execute()
    return res.data

@api_router.get("/products")
async def get_products(category: Optional[str] = None):
    query = supabase.table("products").select("*").eq("is_active", True)
    if category:
        query = query.eq("category", category)
    res = await query.execute()
    return res.data

in_memory_settings = {
    "key": "settings",
    "event_fee_per_person": 50.0,
    "current_phase": "leads"
}

@api_router.get("/event-settings")
async def get_event_settings():
    try:
        res = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
        if res.data and len(res.data) > 0:
            data = res.data[0]
            if "current_phase" in data and data["current_phase"]:
                in_memory_settings["current_phase"] = data["current_phase"]
            if "event_fee_per_person" in data:
                in_memory_settings["event_fee_per_person"] = data["event_fee_per_person"]
    except Exception as e:
        logger.warning(f"Error fetching event settings: {e}")
    return in_memory_settings

@api_router.post("/bookings")
async def create_booking(booking: BookingCreate, request: Request):
    ip = get_client_ip(request)
    if not check_rate_limit(f"booking:{ip}", max_requests=20, window_seconds=60):
        raise HTTPException(429, "Too many booking attempts. Please try again shortly.")

    # Validate event phase: reject direct reservations if phase is not 'active'
    res_settings = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    settings = res_settings.data[0] if res_settings.data else in_memory_settings
    current_phase = settings.get("current_phase") or in_memory_settings.get("current_phase", "leads")
    if current_phase != "active":
        raise HTTPException(
            status_code=403,
            detail="Direct table reservations are currently locked until official graduation dates drop. Please join the priority waitlist."
        )

    # Validate graduation date exists and is active
    res_dates = await supabase.table("graduation_dates").select("*").eq("is_active", True).eq("date_label", booking.graduation_date).execute()
    if not res_dates.data:
        raise HTTPException(400, f"Graduation date '{booking.graduation_date}' is not valid or no longer active")

    event_fee = settings.get("event_fee_per_person", 0.0)
    charged_blocks = (booking.attendees_count + 9) // 10
    base_cost = charged_blocks * event_fee

    # FIX: Always fetch product prices server-side to prevent client-side price manipulation.
    # Client-supplied unit_price and subtotal values are completely ignored.
    validated_selections = []
    food_cost = 0.0
    # Clean/ignore selections if wants_food is False
    if booking.wants_food:
        for sel in booking.selections:
            res_prod = await supabase.table("products").select("*").eq("id", sel.product_id).execute()
            product = res_prod.data[0] if res_prod.data else None
            if not product:
                raise HTTPException(400, f"Product {sel.product_name} not found")
            if not product.get("is_active", True):
                raise HTTPException(400, f"Product {sel.product_name} is no longer available")
            if sel.quantity < 1:
                raise HTTPException(400, f"Quantity for {sel.product_name} must be at least 1")
            if product["stock"] < sel.quantity:
                raise HTTPException(400, f"Insufficient stock for {sel.product_name}. Only {product['stock']} available.")
            # Compute price server-side from DB record
            server_unit_price = float(product["price"])
            server_subtotal = server_unit_price * sel.quantity
            food_cost += server_subtotal
            validated_selections.append({
                "product_id": sel.product_id,
                "product_name": product["name"],  # use canonical name from DB
                "quantity": sel.quantity,
                "unit_price": server_unit_price,
                "subtotal": server_subtotal,
            })

    total = base_cost + food_cost

    # FIX: Expanded to 5 digits (100,000 codes) and limited retries to prevent
    # infinite loops on a near-exhausted code pool.
    reservation_code = generate_reservation_code()
    max_retries = 10
    for attempt in range(max_retries):
        res_book = await supabase.table("bookings").select("id").eq("reservation_code", reservation_code).execute()
        if not res_book.data:
            break
        reservation_code = generate_reservation_code()
    else:
        logger.error("Could not generate a unique reservation code after max retries")
        raise HTTPException(500, "Could not generate a unique reservation code. Please try again.")

    booking_id = str(uuid.uuid4())
    booking_secret = secrets.token_urlsafe(32)
    booking_doc = {
        "id": booking_id,
        "graduate_name": booking.graduate_name,
        "course": booking.course,
        "graduation_date": booking.graduation_date,
        "phone": booking.phone,
        "email": booking.email,
        "attendees_count": booking.attendees_count,
        "wants_food": booking.wants_food,
        "selections": validated_selections,
        "catering_fee": food_cost,
        "event_fee": base_cost,
        "total_amount": total,
        "status": "pending",
        "reservation_code": reservation_code,
        "booking_secret": booking_secret,
        "table_number": None,
        "payment_reference": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await supabase.table("bookings").insert(booking_doc).execute()
    return {
        "id": booking_doc["id"],
        "total_amount": total,
        "base_cost": base_cost,
        "food_cost": food_cost,
        "reservation_code": reservation_code,
        "booking_secret": booking_secret,
        "event_fee_per_person": event_fee
    }


@api_router.post("/payments/initialize")
async def initialize_payment(data: PaymentInit):
    res = await supabase.table("bookings").select("*").eq("id", data.booking_id).execute()
    booking = res.data[0] if res.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Guard against BOLA/IDOR: Validate secret token strictly with constant-time comparison
    expected_secret = booking.get("booking_secret")
    if not expected_secret or not data.booking_secret or not hmac.compare_digest(str(expected_secret), str(data.booking_secret)):
        raise HTTPException(403, "Invalid or missing booking authorization secret")

    if booking["status"] == "confirmed":
        raise HTTPException(400, "Booking is already confirmed")

    # Validate stock before redirecting to payment gateway
    if booking.get("wants_food"):
        for sel in booking.get("selections", []):
            res_prod = await supabase.table("products").select("stock, name, is_active").eq("id", sel["product_id"]).execute()
            product = res_prod.data[0] if res_prod.data else None
            if not product:
                raise HTTPException(400, f"Product {sel['product_name']} not found")
            if not product.get("is_active", True):
                raise HTTPException(400, f"Product {product['name']} is no longer available")
            if product["stock"] < sel["quantity"]:
                raise HTTPException(
                    400,
                    f"Insufficient stock for {product['name']}. Only {product['stock']} available. "
                    "Please modify your booking."
                )

    # Handle zero-amount free booking flow gracefully without calling payment gateway
    if booking["total_amount"] <= 0:
        if booking["status"] != "confirmed":
            reference = f"FREE_{uuid.uuid4().hex[:12]}"
            payment_doc = {
                "id": str(uuid.uuid4()),
                "booking_id": data.booking_id,
                "reference": reference,
                "amount": 0.0,
                "status": "success",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await supabase.table("payments").insert(payment_doc).execute()
            
            booking = await _confirm_booking_internal(booking, reference)
            
        redirect_url = sanitize_callback_url(data.callback_url)
        return {
            "authorization_url": f"{redirect_url}?test=true&booking_id={data.booking_id}&code={booking.get('reservation_code', '')}",
            "reference": booking.get("payment_reference", "FREE")
        }

    if not MOOLRE_USERNAME or not MOOLRE_ACCOUNT_NUMBER:
        raise HTTPException(500, "Moolre not configured. Please add Moolre credentials to backend .env file.")

    external_ref = f"KDL_{uuid.uuid4().hex[:16]}"
    redirect_url = sanitize_callback_url(data.callback_url)
    callback_url = f"{os.environ.get('BACKEND_URL', 'http://127.0.0.1:8000')}/api/moolre/webhook"

    async with httpx.AsyncClient() as http_client:
        response = await http_client.post(
            f"{MOOLRE_BASE_URL}/embed/link",
            headers={
                "X-API-USER": MOOLRE_USERNAME,
                "X-API-PUBKEY": MOOLRE_PUBLIC_KEY,
                "Content-Type": "application/json"
            },
            json={
                "type": 1,
                "amount": str(booking["total_amount"]),
                "email": MOOLRE_BUSINESS_EMAIL,
                "externalref": external_ref,
                "reusable": "0",
                "currency": "GHS",
                "accountnumber": MOOLRE_ACCOUNT_NUMBER,
                "callback": callback_url,
                "redirect": f"{redirect_url}?reference={external_ref}",
                "metadata": {
                    "booking_id": data.booking_id,
                    "reservation_code": booking.get("reservation_code", "")
                }
            },
            timeout=15
        )
        result = response.json()
        logger.info(f"Moolre init response: {result}")

    if result.get("status") == 1 and result.get("data"):
        payment_url = result["data"].get("link") or result["data"].get("url") or result["data"].get("payment_link")
        if not payment_url:
            # Try to find any URL-like field in data
            for v in result["data"].values():
                if isinstance(v, str) and v.startswith("http"):
                    payment_url = v
                    break
        payment_doc = {
            "id": str(uuid.uuid4()),
            "booking_id": data.booking_id,
            "reference": external_ref,
            "amount": booking["total_amount"],
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await supabase.table("payments").insert(payment_doc).execute()
        await supabase.table("bookings").update({"payment_reference": external_ref}).eq("id", data.booking_id).execute()
        return {
            "authorization_url": payment_url,
            "reference": external_ref
        }
    raise HTTPException(400, result.get("message", "Payment initialization failed"))


@api_router.get("/payments/verify/{reference}")
async def verify_payment(reference: str, request: Request):
    """Check DB for a confirmed payment by Moolre externalref.
    If still pending, actively query Moolre's API to pull latest status."""
    ip = get_client_ip(request)
    if not check_rate_limit(f"verify_pay:{ip}", max_requests=30, window_seconds=60):
        raise HTTPException(429, "Too many payment verification requests. Please try again later.")

    res_pay = await supabase.table("payments").select("*").eq("reference", reference).execute()
    payment = res_pay.data[0] if res_pay.data else None

    # FIX: Return 404 for unknown references so the frontend doesn't retry
    # uselessly for 24 seconds on a fake or typo reference.
    if not payment:
        raise HTTPException(404, "Payment reference not found")

    # Already confirmed in our DB
    if payment.get("status") == "success":
        res_book = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
        booking = res_book.data[0] if res_book.data else None
        serialized = serialize_doc(booking)
        if serialized:
            if "email" in serialized:
                serialized["email"] = mask_email(serialized["email"])
            if "phone" in serialized:
                serialized["phone"] = mask_phone(serialized["phone"])
            serialized.pop("payment_reference", None)
            serialized.pop("booking_secret", None)
        return {"status": "success", "booking": serialized}

    # Payment exists but still pending — query Moolre directly for live status
    if payment and MOOLRE_USERNAME and MOOLRE_PUBLIC_KEY and MOOLRE_ACCOUNT_NUMBER:
        try:
            async with httpx.AsyncClient() as http_client:
                moolre_res = await http_client.post(
                    f"{MOOLRE_BASE_URL}/open/transact/status",
                    headers={
                        "X-API-USER": MOOLRE_USERNAME,
                        "X-API-PUBKEY": MOOLRE_PUBLIC_KEY,
                        "Content-Type": "application/json"
                    },
                    json={
                        "type": 1,
                        "idtype": "1",
                        "id": reference,
                        "accountnumber": MOOLRE_ACCOUNT_NUMBER
                    },
                    timeout=10
                )
                moolre_data = moolre_res.json()
                logger.info(f"Moolre status check for {reference}: {moolre_data}")

                moolre_status = moolre_data.get("status")
                inner = moolre_data.get("data", {}) or {}
                txstatus = inner.get("txstatus")

                if moolre_status == 1 and txstatus == 1:
                    updated = await _confirm_payment_by_reference(reference)
                    if updated:
                        serialized = serialize_doc(updated)
                        if serialized:
                            if "email" in serialized:
                                serialized["email"] = mask_email(serialized["email"])
                            if "phone" in serialized:
                                serialized["phone"] = mask_phone(serialized["phone"])
                            serialized.pop("payment_reference", None)
                            serialized.pop("booking_secret", None)
                        return {"status": "success", "booking": serialized}
        except Exception as e:
            logger.error(f"Moolre status check error for {reference}: {e}")

    return {"status": "pending", "message": "Payment not yet confirmed"}

async def _confirm_booking_internal(booking, reference: str):
    """Confirm a booking, assign a unique table, adjust stock, and send notifications.
    Uses retry loop with collision detection to prevent duplicate table assignments.
    """
    booking_id = booking["id"]
    
    # Idempotency guard: check if already confirmed
    if booking["status"] == "confirmed":
        return booking

    max_retries = 5
    confirmed_booking = None
    
    for attempt in range(max_retries):
        table_number = await auto_assign_table(booking["graduation_date"])
        
        # Check if table already taken
        conflict_res = await supabase.table("bookings").select("id")\
            .eq("graduation_date", booking["graduation_date"])\
            .eq("table_number", table_number)\
            .eq("status", "confirmed")\
            .execute()
            
        if conflict_res.data:
            logger.info(f"Table {table_number} taken concurrently. Retrying (attempt {attempt + 1}).")
            continue
            
        # Update status and assign table
        update_res = await supabase.table("bookings").update({
            "status": "confirmed",
            "table_number": table_number,
            "payment_reference": reference
        }).eq("id", booking_id).eq("status", "pending").execute()
        
        if not update_res.data:
            # Already confirmed by a concurrent process
            res_updated = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
            return res_updated.data[0] if res_updated.data else None
            
        # Double check for concurrent collisions
        double_check = await supabase.table("bookings").select("id")\
            .eq("graduation_date", booking["graduation_date"])\
            .eq("table_number", table_number)\
            .eq("status", "confirmed")\
            .execute()
            
        if len(double_check.data) > 1:
            # Collision! Sort IDs, check if we are first
            ids = sorted([row["id"] for row in double_check.data])
            my_index = ids.index(booking_id)
            if my_index > 0:
                # We lost. Revert and retry
                logger.warning(f"Table collision for {table_number}. Reverting booking {booking_id} and retrying.")
                await supabase.table("bookings").update({
                    "status": "pending",
                    "table_number": None,
                    "payment_reference": None
                }).eq("id", booking_id).execute()
                continue
                
        # We won!
        confirmed_booking = update_res.data[0]
        break
    else:
        # Reached max retries, confirm without table
        logger.error(f"Failed to assign unique table for {booking_id} after {max_retries} attempts.")
        await supabase.table("bookings").update({
            "status": "confirmed",
            "table_number": None,
            "payment_reference": reference
        }).eq("id", booking_id).execute()
        res_updated = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
        confirmed_booking = res_updated.data[0] if res_updated.data else None

    if confirmed_booking:
        # Perform side effects exactly once
        # 1. Adjust product stock
        for sel in booking.get("selections", []):
            await adjust_product_stock(sel["product_id"], -sel["quantity"])
            
        # Fetch latest booking state
        res_final = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
        updated = res_final.data[0] if res_final.data else confirmed_booking
        
        # 2. Send email & SMS notifications
        await send_confirmation_email(updated)
        await send_confirmation_sms(updated)
        return updated
        
    return None

async def _confirm_payment_by_reference(reference: str):
    # Mark the payment as successful
    await supabase.table("payments").update({"status": "success"}).eq("reference", reference).execute()
    
    res_pay = await supabase.table("payments").select("*").eq("reference", reference).execute()
    payment = res_pay.data[0] if res_pay.data else None
    if not payment:
        return None

    res_book = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
    booking = res_book.data[0] if res_book.data else None
    if not booking:
        return None
        
    return await _confirm_booking_internal(booking, reference)

@api_router.post("/payments/test-complete/{booking_id}")
async def test_complete_payment(booking_id: str, admin=Depends(get_current_admin)):
    # Security: Restrict test-complete endpoint strictly to non-production environments with verified admin privileges
    allow_test = os.environ.get("ENABLE_TEST_PAYMENTS", "false").lower() in ("true", "1", "yes")
    env_name = os.environ.get("ENVIRONMENT", "production").lower()
    if env_name == "production" and not allow_test:
        raise HTTPException(403, "Test payment completion is disabled in production environment")

    res_book = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
    booking = res_book.data[0] if res_book.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
        
    if booking["status"] == "confirmed":
        return {"status": "already_confirmed", "booking": serialize_doc(booking)}

    reference = f"TEST_{uuid.uuid4().hex[:12]}"
    payment_doc = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "reference": reference,
        "amount": booking["total_amount"],
        "status": "success",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await supabase.table("payments").insert(payment_doc).execute()

    updated = await _confirm_booking_internal(booking, reference)
    return {"status": "success", "booking": serialize_doc(updated)}

@api_router.post("/moolre/webhook")
async def moolre_webhook(request: Request):
    """Handle Moolre payment callback when a payment completes"""
    body = await request.body()
    
    # Signature Verification - Fail-closed to prevent forged payment events
    if not MOOLRE_PRIVATE_KEY:
        logger.error("Moolre webhook received but MOOLRE_PRIVATE_KEY is not configured")
        raise HTTPException(500, "Webhook processing unavailable: secret key unconfigured")

    signature = request.headers.get("x-moolre-signature") or request.headers.get("x-signature", "")
    if not signature:
        logger.warning("Moolre webhook received without signature header")
        raise HTTPException(401, "Missing signature")

    computed = hmac.new(
        MOOLRE_PRIVATE_KEY.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(computed, signature):
        logger.warning("Moolre webhook received invalid signature")
        raise HTTPException(401, "Invalid signature")
        
    try:
        event = json.loads(body)
        logger.info(f"Moolre webhook received: {event}")
    except Exception:
        event = {}

    # Moolre sends status=1 on success, with externalref identifying our payment
    status = event.get("status", 0)
    external_ref = event.get("externalref") or event.get("reference") or event.get("orderId", "")

    if status == 1 and external_ref:
        logger.info(f"Moolre webhook: successful payment for ref {external_ref}")
        try:
            await _confirm_payment_by_reference(external_ref)
        except Exception as e:
            logger.error(f"Moolre webhook confirm error: {e}")
    return {"status": "ok"}


@api_router.get("/bookings/lookup/{reservation_code}")
async def get_booking_by_code(reservation_code: str, request: Request):
    ip = get_client_ip(request)
    if not check_rate_limit(f"lookup:{ip}", max_requests=30, window_seconds=60):
        raise HTTPException(429, "Too many lookup requests. Please try again later.")

    code = reservation_code.upper().strip()
    res = await supabase.table("bookings").select("*").eq("reservation_code", code).execute()

    booking = res.data[0] if res.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
        
    serialized = serialize_doc(booking)
    # Mask PII and strip authorization secrets to protect customer privacy against identifier harvesting & BOLA
    if serialized:
        if "email" in serialized:
            serialized["email"] = mask_email(serialized["email"])
        if "phone" in serialized:
            serialized["phone"] = mask_phone(serialized["phone"])
        serialized.pop("payment_reference", None)
        serialized.pop("booking_secret", None)
    return serialized

# ==================== ADMIN ROUTES ====================

@api_router.post("/admin/login")
async def admin_login(data: AdminLoginReq, request: Request):
    ip = get_client_ip(request)
    if not check_rate_limit(f"login:{ip}", max_requests=10, window_seconds=60):
        raise HTTPException(429, "Too many login attempts. Please try again in a minute.")

    try:
        res = await supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password
        })
        if not res or not res.session:
            raise HTTPException(401, "Invalid credentials")
        return {"token": res.session.access_token, "email": res.user.email}
    except Exception:
        raise HTTPException(401, "Invalid credentials")

@api_router.get("/admin/stats")
async def admin_get_stats(admin=Depends(get_current_admin)):
    res = await supabase.table("bookings").select("status, total_amount, attendees_count").execute()
    bookings = res.data or []
    
    total_bookings = len(bookings)
    confirmed = sum(1 for b in bookings if b["status"] == "confirmed")
    pending = sum(1 for b in bookings if b["status"] == "pending")
    revenue = sum(float(b["total_amount"]) for b in bookings if b["status"] == "confirmed")
    attendees = sum(int(b["attendees_count"]) for b in bookings if b["status"] == "confirmed")
    
    return {
        "total_bookings": total_bookings,
        "confirmed_bookings": confirmed,
        "pending_bookings": pending,
        "total_revenue": revenue,
        "total_attendees": attendees
    }

@api_router.get("/admin/bookings")
async def admin_get_bookings(admin=Depends(get_current_admin)):
    res = await supabase.table("bookings").select("*").order("created_at", desc=True).execute()
    return res.data

@api_router.get("/admin/payments")
async def admin_get_payments(admin=Depends(get_current_admin)):
    res = await supabase.table("payments").select("*").order("created_at", desc=True).execute()
    return res.data

@api_router.get("/admin/products")
async def admin_get_products(admin=Depends(get_current_admin)):
    res = await supabase.table("products").select("*").execute()
    return res.data

@api_router.post("/admin/products")
async def admin_add_product(data: ProductCreate, admin=Depends(get_current_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "category": data.category,
        "price": data.price,
        "stock": data.stock,
        "vendor": data.vendor,
        "is_active": data.is_active
    }
    await supabase.table("products").insert(doc).execute()
    return doc

@api_router.patch("/admin/products/{product_id}")
async def admin_update_product(product_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"name", "category", "price", "stock", "vendor", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    # Reject empty updates to avoid a no-op DB call
    if not update:
        raise HTTPException(400, "No valid fields provided for update")
        
    if "price" in update:
        price = update["price"]
        if not isinstance(price, (int, float)) or price < 0:
            raise HTTPException(400, "Price must be a non-negative number")
    if "stock" in update:
        stock = update["stock"]
        if not isinstance(stock, int) or stock < 0:
            raise HTTPException(400, "Stock must be a non-negative integer")

    res = await supabase.table("products").update(update).eq("id", product_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return {"message": "Product updated"}

@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin=Depends(get_current_admin)):
    # FIX: Soft-delete instead of hard-delete to preserve referential integrity.
    # Hard-deleting products that appear in existing bookings breaks analytics
    # (category lookups default to 'food' for missing products).
    res = await supabase.table("products").update({"is_active": False}).eq("id", product_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return {"message": "Product deactivated"}

@api_router.get("/admin/dates")
async def admin_get_dates(admin=Depends(get_current_admin)):
    res = await supabase.table("graduation_dates").select("*").execute()
    return res.data

@api_router.post("/admin/dates")
async def admin_create_date(data: dict, admin=Depends(get_current_admin)):
    date_label = data.get("date_label", "").strip()
    is_active = data.get("is_active", True)
    if not date_label:
        raise HTTPException(400, "date_label cannot be empty")
        
    # Check if a date with this label already exists
    exist_res = await supabase.table("graduation_dates").select("id").eq("date_label", date_label).execute()
    if exist_res.data:
        raise HTTPException(400, f"Graduation date '{date_label}' already exists")

    doc = {"id": str(uuid.uuid4()), "date_label": date_label, "is_active": is_active}
    await supabase.table("graduation_dates").insert(doc).execute()
    return {"id": doc["id"], "message": "Date created"}

@api_router.patch("/admin/dates/{date_id}")
async def admin_update_date(date_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"date_label", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    # Reject empty updates
    if not update:
        raise HTTPException(400, "No valid fields provided for update")
        
    if "date_label" in update:
        date_label = update["date_label"].strip()
        if not date_label:
            raise HTTPException(400, "date_label cannot be empty")
        update["date_label"] = date_label
        
        # Check if another date has this label
        exist_res = await supabase.table("graduation_dates").select("id")\
            .eq("date_label", date_label)\
            .neq("id", date_id)\
            .execute()
        if exist_res.data:
            raise HTTPException(400, f"Graduation date '{date_label}' already exists")

    res = await supabase.table("graduation_dates").update(update).eq("id", date_id).execute()
    if not res.data:
        raise HTTPException(404, "Date not found")
    return {"message": "Date updated"}

@api_router.delete("/admin/dates/{date_id}")
async def admin_delete_date(date_id: str, admin=Depends(get_current_admin)):
    # FIX: Check whether any confirmed or pending bookings reference this date
    # before deleting it. Deleting a date that has active bookings breaks the
    # booking detail display and makes it impossible to re-create the same date.
    date_res = await supabase.table("graduation_dates").select("date_label").eq("id", date_id).execute()
    if not date_res.data:
        raise HTTPException(404, "Date not found")
    date_label = date_res.data[0].get("date_label", "")
    if date_label:
        bookings_res = await supabase.table("bookings").select("id").eq("graduation_date", date_label).execute()
        if bookings_res.data:
            raise HTTPException(
                400,
                f"Cannot delete this date: {len(bookings_res.data)} booking(s) reference it. "
                "Deactivate it instead (toggle is_active to false)."
            )
    await supabase.table("graduation_dates").delete().eq("id", date_id).execute()
    return {"message": "Date deleted"}

@api_router.post("/admin/tables/assign")
async def admin_assign_table(data: TableAssign, admin=Depends(get_current_admin)):
    table_value = data.table_number if data.table_number else None
    
    # We should get the booking first to know its graduation date
    res_book = await supabase.table("bookings").select("*").eq("id", data.booking_id).execute()
    booking = res_book.data[0] if res_book.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
        
    if table_value:
        # Check if this table is already assigned to another confirmed booking on the same graduation date
        conflict_res = await supabase.table("bookings").select("id, graduate_name")\
            .eq("graduation_date", booking["graduation_date"])\
            .eq("table_number", table_value)\
            .eq("status", "confirmed")\
            .neq("id", data.booking_id)\
            .execute()
        if conflict_res.data:
            conflict_name = conflict_res.data[0].get("graduate_name", "another graduate")
            raise HTTPException(400, f"Table {table_value} is already assigned to {conflict_name} on {booking['graduation_date']}.")
            
    res = await supabase.table("bookings").update({"table_number": table_value}).eq("id", data.booking_id).execute()
    if not res.data:
        raise HTTPException(404, "Booking not found")
    msg = f"Table {table_value} assigned" if table_value else "Table assignment cleared"
    return {"message": msg}


@api_router.get("/admin/settings")
async def admin_get_settings(admin=Depends(get_current_admin)):
    try:
        res = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
        if res.data and len(res.data) > 0:
            data = res.data[0]
            if "current_phase" in data and data["current_phase"]:
                in_memory_settings["current_phase"] = data["current_phase"]
            if "event_fee_per_person" in data:
                in_memory_settings["event_fee_per_person"] = data["event_fee_per_person"]
    except Exception as e:
        logger.warning(f"Error reading admin settings: {e}")
    return in_memory_settings

@api_router.patch("/admin/settings")
async def admin_update_settings(data: dict, admin=Depends(get_current_admin)):
    allowed = {"event_fee_per_person", "current_phase"}
    update = {k: v for k, v in data.items() if k in allowed}
    
    if "event_fee_per_person" in update:
        fee = update["event_fee_per_person"]
        if not isinstance(fee, (int, float)) or fee < 0:
            raise HTTPException(400, "event_fee_per_person must be a non-negative number")
        in_memory_settings["event_fee_per_person"] = fee
            
    if "current_phase" in update:
        phase = update["current_phase"]
        if phase not in ["leads", "active"]:
            raise HTTPException(400, "current_phase must be either 'leads' or 'active'")
        in_memory_settings["current_phase"] = phase

    if not {k for k in update if k != "key"}:
        raise HTTPException(400, "No valid fields provided for update")
        
    update["key"] = "settings"
    try:
        await supabase.table("event_settings").upsert(update).execute()
    except Exception as e:
        logger.warning(f"Failed to persist settings in Supabase: {e}")
    return {"message": "Settings updated successfully", "settings": in_memory_settings}

# ==================== LEADS & WAITLIST ENDPOINTS ====================

in_memory_leads = []

@api_router.post("/leads")
async def create_lead(lead: LeadCreate, request: Request):
    ip = get_client_ip(request)
    if not check_rate_limit(f"lead_ip:{ip}", max_requests=15, window_seconds=60):
        raise HTTPException(429, "Too many requests. Please try again shortly.")

    if not lead.full_name.strip() or not lead.email.strip() or not lead.phone.strip() or not lead.course.strip():
        raise HTTPException(400, "Full name, email, phone number, and course are required.")
    
    clean_email = lead.email.strip().lower()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()

    # Deduplication & Toll Fraud Prevention: Check if this email was registered recently
    try:
        res_existing = await supabase.table("leads").select("*").eq("email", clean_email).execute()
        if res_existing.data and len(res_existing.data) > 0:
            existing_lead = res_existing.data[0]
            last_sent = existing_lead.get("last_email_sent_at") or existing_lead.get("created_at")
            if last_sent:
                try:
                    last_dt = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                    elapsed = (now_utc - last_dt).total_seconds()
                    if elapsed < 300:
                        # Return existing registration without re-dispatching email to prevent spam/toll fraud
                        return {
                            "status": "success",
                            "lead_code": existing_lead.get("lead_code", ""),
                            "message": "You are already on the priority waitlist! Confirmation was recently sent.",
                            "data": existing_lead
                        }
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Lead deduplication check notice: {e}")
    
    lead_code = generate_lead_code()
    for _ in range(10):
        try:
            res_check = await supabase.table("leads").select("id").eq("lead_code", lead_code).execute()
            if not res_check.data:
                break
        except Exception:
            break
        lead_code = generate_lead_code()

    lead_id = str(uuid.uuid4())
    lead_doc = {
        "id": lead_id,
        "lead_code": lead_code,
        "full_name": lead.full_name.strip(),
        "email": clean_email,
        "phone": lead.phone.strip(),
        "institution": lead.institution.strip() if lead.institution else "General",
        "course": lead.course.strip() if lead.course else "",
        "estimated_guests": lead.estimated_guests,
        "expected_graduation_period": lead.expected_graduation_period.strip() if lead.expected_graduation_period else "",
        "notes": lead.notes.strip() if lead.notes else "",
        "status": "pending",
        "last_email_sent_at": now_iso,
        "created_at": now_iso
    }
    
    saved_to_db = False
    try:
        res = await supabase.table("leads").insert(lead_doc).execute()
        if res.data:
            saved_to_db = True
    except Exception as e:
        logger.warning(f"Supabase lead insert notice: {e}")

    if not saved_to_db:
        in_memory_leads.insert(0, lead_doc)

    # Send priority waitlist confirmation email
    try:
        await send_lead_confirmation_email(lead_doc)
    except Exception as e:
        logger.warning(f"Could not send lead confirmation email: {e}")

    return {
        "status": "success",
        "lead_code": lead_code,
        "message": "Thank you! You have been added to the priority reservation waitlist.",
        "data": lead_doc
    }

@api_router.get("/admin/leads")
async def admin_get_leads(admin=Depends(get_current_admin)):
    db_leads = []
    try:
        res = await supabase.table("leads").select("*").order("created_at", desc=True).execute()
        if res.data:
            db_leads = res.data
    except Exception as e:
        logger.warning(f"Could not fetch leads from Supabase: {e}")

    combined = list(db_leads)
    existing_ids = {l.get("id") for l in db_leads}
    for mem_l in in_memory_leads:
        if mem_l["id"] not in existing_ids:
            combined.append(mem_l)
            
    combined.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return combined

@api_router.patch("/admin/leads/{lead_id}")
async def admin_update_lead(lead_id: str, data: LeadStatusUpdate, admin=Depends(get_current_admin)):
    update_data = {}
    if data.status:
        update_data["status"] = data.status
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if not update_data:
        raise HTTPException(400, "No update parameters provided")

    for mem_l in in_memory_leads:
        if mem_l["id"] == lead_id:
            mem_l.update(update_data)

    try:
        res = await supabase.table("leads").update(update_data).eq("id", lead_id).execute()
        if res.data:
            return {"message": "Lead updated successfully", "data": res.data[0]}
    except Exception as e:
        logger.warning(f"Error updating lead {lead_id} in Supabase: {e}")

    return {"message": "Lead updated successfully"}

@api_router.delete("/admin/leads/{lead_id}")
async def admin_delete_lead(lead_id: str, admin=Depends(get_current_admin)):
    global in_memory_leads
    in_memory_leads = [l for l in in_memory_leads if l["id"] != lead_id]
    try:
        await supabase.table("leads").delete().eq("id", lead_id).execute()
    except Exception as e:
        logger.warning(f"Error deleting lead {lead_id} in Supabase: {e}")

    return {"message": "Lead deleted successfully"}

@api_router.post("/admin/leads/resend-all")
async def admin_resend_all_lead_emails(admin=Depends(get_current_admin)):
    db_leads = []
    try:
        res = await supabase.table("leads").select("*").execute()
        if res.data:
            db_leads = res.data
    except Exception as e:
        logger.warning(f"Could not fetch leads from Supabase: {e}")

    combined = list(db_leads)
    existing_ids = {l.get("id") for l in db_leads}
    for mem_l in in_memory_leads:
        if mem_l["id"] not in existing_ids:
            combined.append(mem_l)

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    sent_count = 0
    failed_count = 0
    skipped_cooldown = 0

    for lead in combined:
        if not lead.get("email"):
            continue

        # Cooldown check: prevent mass spamming if recently dispatched (300s / 5 min cooldown)
        last_sent = lead.get("last_email_sent_at")
        if last_sent:
            try:
                last_dt = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                elapsed = (now_utc - last_dt).total_seconds()
                if elapsed < 300:
                    skipped_cooldown += 1
                    continue
            except Exception as e:
                logger.warning(f"Error checking cooldown for lead {lead.get('id')}: {e}")

        success = await send_lead_confirmation_email(lead)
        if success:
            sent_count += 1
            # Update state in DB and cache
            try:
                await supabase.table("leads").update({"last_email_sent_at": now_iso}).eq("id", lead["id"]).execute()
            except Exception as e:
                logger.warning(f"Could not update last_email_sent_at for lead {lead.get('id')}: {e}")
            lead["last_email_sent_at"] = now_iso
        else:
            failed_count += 1

    return {
        "message": f"Waitlist emails sent to {sent_count} leads ({skipped_cooldown} skipped due to active cooldown).",
        "total_leads": len(combined),
        "sent_count": sent_count,
        "skipped_cooldown": skipped_cooldown,
        "failed_count": failed_count
    }

@api_router.post("/admin/leads/{lead_id}/resend-email")
async def admin_resend_single_lead_email(lead_id: str, admin=Depends(get_current_admin)):
    db_leads = []
    try:
        res = await supabase.table("leads").select("*").eq("id", lead_id).execute()
        if res.data:
            db_leads = res.data
    except Exception as e:
        logger.warning(f"Could not fetch lead from Supabase: {e}")

    lead_doc = db_leads[0] if db_leads else None
    if not lead_doc:
        for mem_l in in_memory_leads:
            if mem_l["id"] == lead_id:
                lead_doc = mem_l
                break

    if not lead_doc:
        raise HTTPException(404, "Lead not found")

    # Cooldown check: prevent rapid repeated outbound email dispatch (300s / 5 min cooldown)
    last_sent = lead_doc.get("last_email_sent_at")
    if last_sent:
        try:
            last_dt = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            if elapsed < 300:
                remaining = int(300 - elapsed)
                raise HTTPException(429, f"Please wait {remaining} seconds before resending an email to this lead.")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not parse last_email_sent_at timestamp: {e}")

    success = await send_lead_confirmation_email(lead_doc)
    if not success:
        raise HTTPException(500, "Failed to send lead email. Please check server email logs.")

    now_iso = datetime.now(timezone.utc).isoformat()
    # Update state in DB and in-memory cache
    try:
        await supabase.table("leads").update({"last_email_sent_at": now_iso}).eq("id", lead_id).execute()
    except Exception as e:
        logger.warning(f"Could not update last_email_sent_at in Supabase: {e}")

    for mem_l in in_memory_leads:
        if mem_l["id"] == lead_id:
            mem_l["last_email_sent_at"] = now_iso

    return {"message": f"Confirmation email resent to {lead_doc.get('email')}"}

# Include router
app.include_router(api_router)

# Configure secure CORS settings
cors_origins_raw = os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,https://kadelgh.com')
cors_origins = [o.strip() for o in cors_origins_raw.split(',') if o.strip()]

if "*" in cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("shutdown")
async def shutdown_db_client():
    pass
