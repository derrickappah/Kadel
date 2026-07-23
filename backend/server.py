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

class AdminLoginReq(BaseModel):
    email: str
    password: str

class ProductCreate(BaseModel):
    name: str
    category: str
    price: float
    stock: int
    vendor: str = ""

class TableAssign(BaseModel):
    booking_id: str
    # Optional to allow clearing a table assignment (set to null)
    table_number: Optional[str] = None

class PaymentInit(BaseModel):
    booking_id: str
    callback_url: str

# ==================== HELPERS ====================

def generate_reservation_code():
    prefix = "KAD"
    # 5 digits gives 100,000 possible codes (vs. 1,000 with 3 digits),
    # greatly reducing collision probability for large events.
    numbers = ''.join(random.choices(string.digits, k=5))
    return f"{prefix}{numbers}"

def serialize_doc(doc):
    if doc is None:
        return None
    result = dict(doc)
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result

async def get_current_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth.split(" ")[1]
    try:
        res = await supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(401, "Invalid token")
        return {"email": res.user.email, "id": res.user.id}
    except Exception as e:
        logger.error(f"get_current_admin auth error: {e}")
        raise HTTPException(401, "Invalid token")

async def auto_assign_table():
    # FIX: Order by the numeric value of the table number (not by created_at)
    # so we always increment from the highest assigned number rather than the
    # most recently created booking. Using created_at ordering could return T3
    # while T15 already exists, causing a table number collision.
    res = await supabase.table("bookings").select("table_number").not_.is_("table_number", "null").execute()
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
    res = await supabase.table("products").select("stock").eq("id", product_id).execute()
    if res.data:
        current = res.data[0]["stock"]
        # FIX: Guard against stock going negative. Stock should never be < 0;
        # if the decrement would cause that, clamp to 0 and log a warning.
        new_stock = current + amount
        if new_stock < 0:
            logger.warning(
                f"Stock adjustment for product {product_id} would result in negative stock "
                f"(current={current}, adjustment={amount}). Clamping to 0."
            )
            new_stock = 0
        await supabase.table("products").update({"stock": new_stock}).eq("id", product_id).execute()

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

@api_router.get("/event-settings")
async def get_event_settings():
    res = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    return res.data[0] if res.data else {"event_fee_per_person": 0.0}

@api_router.post("/bookings")
async def create_booking(booking: BookingCreate):
    res_settings = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    settings = res_settings.data[0] if res_settings.data else {}
    event_fee = settings.get("event_fee_per_person", 0.0)
    charged_blocks = (booking.attendees_count + 9) // 10
    base_cost = charged_blocks * event_fee

    # FIX: Always fetch product prices server-side to prevent client-side price manipulation.
    # Client-supplied unit_price and subtotal values are completely ignored.
    validated_selections = []
    food_cost = 0.0
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
        "event_fee_per_person": event_fee
    }

@api_router.post("/payments/initialize")
async def initialize_payment(data: PaymentInit):
    res = await supabase.table("bookings").select("*").eq("id", data.booking_id).execute()
    booking = res.data[0] if res.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
    if not MOOLRE_USERNAME or not MOOLRE_ACCOUNT_NUMBER:
        raise HTTPException(500, "Moolre not configured. Please add Moolre credentials to backend .env file.")

    external_ref = f"KDL_{uuid.uuid4().hex[:16]}"
    redirect_url = data.callback_url or f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/payment/callback"
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
async def verify_payment(reference: str):
    """Check DB for a confirmed payment by Moolre externalref.
    If still pending, actively query Moolre's API to pull latest status."""
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
        return {"status": "success", "booking": serialize_doc(booking)}

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
                        return {"status": "success", "booking": serialize_doc(updated)}
        except Exception as e:
            logger.error(f"Moolre status check error for {reference}: {e}")

    return {"status": "pending", "message": "Payment not yet confirmed"}
async def _confirm_payment_by_reference(reference: str):
    """Shared logic: mark payment success, confirm booking, send notifications.
    
    FIX (race condition): We update payment status first, then re-fetch the booking
    status. Because multiple paths can call this function concurrently (webhook +
    client polling), we do a final idempotency check on the booking status after
    the payment update, not before, to minimise the race window.
    """
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

    # FIX: Re-check booking status after fetching to guard against concurrent confirms.
    if booking["status"] == "confirmed":
        return booking

    # FIX: Re-validate stock before decrementing to guard against race conditions
    # where multiple concurrent bookings depleted stock between creation and payment.
    for sel in booking.get("selections", []):
        res_prod = await supabase.table("products").select("stock").eq("id", sel["product_id"]).execute()
        if res_prod.data:
            available = res_prod.data[0]["stock"]
            qty = sel.get("quantity", 0)
            if available < qty:
                logger.error(
                    f"Stock depleted for product {sel['product_id']} during payment confirmation. "
                    f"Available: {available}, Required: {qty}. Booking {booking['id']} confirmed but stock not decremented."
                )
                # Don't block confirmation — payment was made — but log and skip decrement
                continue
            await adjust_product_stock(sel["product_id"], -qty)
        else:
            logger.warning(f"Product {sel['product_id']} not found during stock adjustment for booking {booking['id']}")

    table_number = await auto_assign_table()
    await supabase.table("bookings").update({
        "status": "confirmed",
        "table_number": table_number
    }).eq("id", payment["booking_id"]).execute()
    
    res_updated = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
    updated = res_updated.data[0] if res_updated.data else None
    await send_confirmation_email(updated)
    await send_confirmation_sms(updated)
    return updated

@api_router.post("/payments/test-complete/{booking_id}")
async def test_complete_payment(booking_id: str):
    res_book = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
    booking = res_book.data[0] if res_book.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
    # FIX: Idempotency guard — if already confirmed, return early without
    # decrementing stock or sending duplicate emails.
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

    # FIX: Validate and decrement stock before confirming, same as production path.
    # The previous code skipped stock checking, allowing negative stock.
    for sel in booking.get("selections", []):
        res_prod = await supabase.table("products").select("stock").eq("id", sel["product_id"]).execute()
        if res_prod.data:
            available = res_prod.data[0]["stock"]
            qty = sel.get("quantity", 0)
            if available < qty:
                logger.warning(
                    f"[test-complete] Insufficient stock for product {sel['product_id']}. "
                    f"Available: {available}, Required: {qty}. Proceeding anyway (test mode)."
                )
        await adjust_product_stock(sel["product_id"], -sel["quantity"])

    table_number = await auto_assign_table()
    await supabase.table("bookings").update({
        "status": "confirmed",
        "table_number": table_number,
        "payment_reference": reference
    }).eq("id", booking_id).execute()
    
    res_updated = await supabase.table("bookings").select("*").eq("id", booking_id).execute()
    updated = res_updated.data[0] if res_updated.data else None
    await send_confirmation_email(updated)
    await send_confirmation_sms(updated)
    return {"status": "success", "booking": serialize_doc(updated)}

@api_router.post("/moolre/webhook")
async def moolre_webhook(request: Request):
    """Handle Moolre payment callback when a payment completes"""
    try:
        body = await request.body()
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
async def get_booking_by_code(reservation_code: str):
    res = await supabase.table("bookings").select("*").eq("reservation_code", reservation_code).execute()
    booking = res.data[0] if res.data else None
    if not booking:
        raise HTTPException(404, "Booking not found")
    return serialize_doc(booking)

# ==================== ADMIN ROUTES ====================

@api_router.post("/admin/login")
async def admin_login(data: AdminLoginReq):
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
        "is_active": True
    }
    await supabase.table("products").insert(doc).execute()
    return doc

@api_router.patch("/admin/products/{product_id}")
async def admin_update_product(product_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"name", "category", "price", "stock", "vendor", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    # FIX: Reject empty updates to avoid a no-op DB call
    if not update:
        raise HTTPException(400, "No valid fields provided for update")
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
    doc = {"id": str(uuid.uuid4()), "date_label": data.get("date_label", ""), "is_active": True}
    await supabase.table("graduation_dates").insert(doc).execute()
    return {"id": doc["id"], "message": "Date created"}

@api_router.patch("/admin/dates/{date_id}")
async def admin_update_date(date_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"date_label", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    # FIX: Reject empty updates — mirrors the guard already on /admin/products/{id}.
    if not update:
        raise HTTPException(400, "No valid fields provided for update")
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
    # FIX: Treat empty string as null to properly clear table assignments.
    # An empty string would not be caught by SQL IS NULL checks, breaking
    # auto_assign_table() which filters on NOT NULL table numbers.
    table_value = data.table_number if data.table_number else None
    res = await supabase.table("bookings").update({"table_number": table_value}).eq("id", data.booking_id).execute()
    if not res.data:
        raise HTTPException(404, "Booking not found")
    msg = f"Table {table_value} assigned" if table_value else "Table assignment cleared"
    return {"message": msg}

@api_router.get("/admin/settings")
async def admin_get_settings(admin=Depends(get_current_admin)):
    res = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    return res.data[0] if res.data else {"event_fee_per_person": 50.0}

@api_router.patch("/admin/settings")
async def admin_update_settings(data: dict, admin=Depends(get_current_admin)):
    allowed = {"event_fee_per_person"}
    update = {k: v for k, v in data.items() if k in allowed}
    # FIX: Validate that event_fee_per_person is a non-negative number.
    # A negative fee would silently credit money back to the customer during
    # booking creation (base_cost = charged_blocks * negative_fee < 0).
    if "event_fee_per_person" in update:
        fee = update["event_fee_per_person"]
        if not isinstance(fee, (int, float)) or fee < 0:
            raise HTTPException(400, "event_fee_per_person must be a non-negative number")
    if not {k for k in update if k != "key"}:
        raise HTTPException(400, "No valid fields provided for update")
    update["key"] = "settings"
    await supabase.table("event_settings").upsert(update).execute()
    return {"message": "Settings updated"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    pass
