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

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class BookingSelection(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float

class BookingCreate(BaseModel):
    graduate_name: str
    course: str
    graduation_date: str
    phone: str
    email: str
    attendees_count: int
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
    table_number: str

class PaymentInit(BaseModel):
    booking_id: str
    callback_url: str

# ==================== HELPERS ====================

def generate_reservation_code():
    prefix = "KAD"
    numbers = ''.join(random.choices(string.digits, k=3))
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
    res = await supabase.table("bookings").select("table_number").not_.is_("table_number", "null").order("created_at", desc=True).limit(1).execute()
    if res.data and res.data[0].get("table_number"):
        try:
            last_num = int(res.data[0]["table_number"].replace("T", ""))
            return f"T{last_num + 1}"
        except (ValueError, AttributeError):
            pass
    return "T1"

async def adjust_product_stock(product_id: str, amount: int):
    res = await supabase.table("products").select("stock").eq("id", product_id).execute()
    if res.data:
        current = res.data[0]["stock"]
        await supabase.table("products").update({"stock": current + amount}).eq("id", product_id).execute()

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
    rate_per_guest = (event_fee / attendees_count) if attendees_count > 0 else 0.0

    selections = booking.get("selections", [])
    
    # HTML cost breakdown rows
    breakdown_html = f"""
          <tr class="table-row">
            <td class="table-label" style="padding: 12px 0; font-size: 15px; color: #86868b; font-weight: 400; text-align: left; width: 60%;">
              Table Reservation Fee<br>
              <span style="font-size: 12px; color: #86868b;">{attendees_count} guests @ GHC {rate_per_guest:.2f} / guest</span>
            </td>
            <td class="table-value" style="padding: 12px 0; font-size: 15px; color: #1d1d1f; font-weight: 600; text-align: right; vertical-align: top;">GHC {event_fee:.2f}</td>
          </tr>
    """

    breakdown_plain = f"  Table Reservation Fee ({attendees_count} guests @ GHC {rate_per_guest:.2f} / guest): GHC {event_fee:.2f}"

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
    return res.data[0] if res.data else {"event_fee_per_person": 50.0}

@api_router.post("/bookings")
async def create_booking(booking: BookingCreate):
    res_settings = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    settings = res_settings.data[0] if res_settings.data else {}
    event_fee = settings.get("event_fee_per_person", 50.0)
    base_cost = (event_fee / 10.0) * booking.attendees_count
    food_cost = sum(s.subtotal for s in booking.selections)
    total = base_cost + food_cost

    # Validate stock
    for sel in booking.selections:
        res_prod = await supabase.table("products").select("*").eq("id", sel.product_id).execute()
        product = res_prod.data[0] if res_prod.data else None
        if not product:
            raise HTTPException(400, f"Product {sel.product_name} not found")
        if product["stock"] < sel.quantity:
            raise HTTPException(400, f"Insufficient stock for {sel.product_name}. Only {product['stock']} available.")

    reservation_code = generate_reservation_code()
    while True:
        res_book = await supabase.table("bookings").select("id").eq("reservation_code", reservation_code).execute()
        if not res_book.data:
            break
        reservation_code = generate_reservation_code()

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
        "selections": [s.model_dump() for s in booking.selections],
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
    if not PAYSTACK_SECRET_KEY:
        raise HTTPException(500, "Paystack not configured. Please add PAYSTACK_SECRET_KEY to backend .env file.")

    amount_pesewas = int(booking["total_amount"] * 100)
    reference = f"GT_{uuid.uuid4().hex[:16]}"

    async with httpx.AsyncClient() as http_client:
        response = await http_client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={
                "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "email": booking["email"],
                "amount": amount_pesewas,
                "reference": reference,
                "callback_url": data.callback_url,
                "currency": "GHS",
                "metadata": {
                    "booking_id": data.booking_id,
                    "reservation_code": booking.get("reservation_code", "")
                }
            }
        )
        result = response.json()

    if result.get("status"):
        payment_doc = {
            "id": str(uuid.uuid4()),
            "booking_id": data.booking_id,
            "reference": result["data"]["reference"],
            "amount": booking["total_amount"],
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await supabase.table("payments").insert(payment_doc).execute()
        await supabase.table("bookings").update({"payment_reference": result["data"]["reference"]}).eq("id", data.booking_id).execute()
        return {
            "authorization_url": result["data"]["authorization_url"],
            "reference": result["data"]["reference"]
        }
    raise HTTPException(400, result.get("message", "Payment initialization failed"))

@api_router.get("/payments/verify/{reference}")
async def verify_payment(reference: str):
    if not PAYSTACK_SECRET_KEY:
        raise HTTPException(500, "Paystack not configured")

    async with httpx.AsyncClient() as http_client:
        response = await http_client.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
        )
        result = response.json()

    if result.get("status") and result["data"]["status"] == "success":
        await supabase.table("payments").update({
            "status": "success"
        }).eq("reference", reference).execute()
        
        res_pay = await supabase.table("payments").select("*").eq("reference", reference).execute()
        payment = res_pay.data[0] if res_pay.data else None
        if payment:
            res_book = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
            booking = res_book.data[0] if res_book.data else None
            if booking and booking["status"] != "confirmed":
                for sel in booking.get("selections", []):
                    await adjust_product_stock(sel["product_id"], -sel["quantity"])
                table_number = await auto_assign_table()
                await supabase.table("bookings").update({
                    "status": "confirmed",
                    "table_number": table_number
                }).eq("id", payment["booking_id"]).execute()
                
                res_updated = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
                updated = res_updated.data[0] if res_updated.data else None
                await send_confirmation_email(updated)
                return {"status": "success", "booking": serialize_doc(updated)}
        return {"status": "success", "message": "Payment verified"}

    res_pay = await supabase.table("payments").select("*").eq("reference", reference).execute()
    payment = res_pay.data[0] if res_pay.data else None
    if payment and payment.get("status") == "success":
        res_book = await supabase.table("bookings").select("*").eq("id", payment["booking_id"]).execute()
        booking = res_book.data[0] if res_book.data else None
        return {"status": "success", "booking": serialize_doc(booking)}
    return {"status": "failed", "message": "Payment verification failed"}

@api_router.post("/payments/test-complete/{booking_id}")
async def test_complete_payment(booking_id: str):
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
    
    for sel in booking.get("selections", []):
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
    return {"status": "success", "booking": serialize_doc(updated)}

@api_router.post("/paystack/webhook")
async def paystack_webhook(request: Request):
    signature = request.headers.get("x-paystack-signature", "")
    body = await request.body()
    if PAYSTACK_SECRET_KEY:
        computed = hmac.new(
            PAYSTACK_SECRET_KEY.encode('utf-8'),
            body,
            hashlib.sha512
        ).hexdigest()
        if not hmac.compare_digest(computed, signature):
            raise HTTPException(401, "Invalid signature")
    event = json.loads(body)
    if event.get("event") == "charge.success":
        ref = event["data"]["reference"]
        logger.info(f"Webhook: charge.success for {ref}")
        try:
            await verify_payment(ref)
        except Exception as e:
            logger.error(f"Webhook verify error: {e}")
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
    res = await supabase.table("products").update(update).eq("id", product_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return {"message": "Product updated"}

@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin=Depends(get_current_admin)):
    await supabase.table("products").delete().eq("id", product_id).execute()
    return {"message": "Product deleted"}

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
    res = await supabase.table("graduation_dates").update(update).eq("id", date_id).execute()
    if not res.data:
        raise HTTPException(404, "Date not found")
    return {"message": "Date updated"}

@api_router.delete("/admin/dates/{date_id}")
async def admin_delete_date(date_id: str, admin=Depends(get_current_admin)):
    await supabase.table("graduation_dates").delete().eq("id", date_id).execute()
    return {"message": "Date deleted"}

@api_router.post("/admin/tables/assign")
async def admin_assign_table(data: TableAssign, admin=Depends(get_current_admin)):
    res = await supabase.table("bookings").update({"table_number": data.table_number}).eq("id", data.booking_id).execute()
    if not res.data:
        raise HTTPException(404, "Booking not found")
    return {"message": f"Table {data.table_number} assigned"}

@api_router.get("/admin/settings")
async def admin_get_settings(admin=Depends(get_current_admin)):
    res = await supabase.table("event_settings").select("*").eq("key", "settings").execute()
    return res.data[0] if res.data else {"event_fee_per_person": 50.0}

@api_router.patch("/admin/settings")
async def admin_update_settings(data: dict, admin=Depends(get_current_admin)):
    allowed = {"event_fee_per_person"}
    update = {k: v for k, v in data.items() if k in allowed}
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
