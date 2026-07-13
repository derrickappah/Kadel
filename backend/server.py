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
    
    if not resend_from:
        resend_from = "reservations@kadelgh.com"

    # Make sure we format the from name nicely if it doesn't have one
    if not ("<" in resend_from):
        resend_from = f"KaDel Ghana <{resend_from}>"

    graduate_name = booking.get('graduate_name', 'Graduate')
    reservation_code = booking.get('reservation_code', 'N/A')
    table_number = booking.get('table_number')
    program = booking.get('course', 'Graduation Program')
    graduation_date = booking.get('graduation_date', 'N/A')
    attendees_count = booking.get('attendees_count', 0)
    total_amount = booking.get('total_amount', 0.0)
    
    table_val = f'<span class="table-badge">{table_number}</span>' if table_number else '<em>Pending Assignment</em>'
    table_val_plain = table_number if table_number else 'Pending Assignment'
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9fa; color: #1f2937; margin: 0; padding: 0; }}
    .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
    .header {{ background: linear-gradient(135deg, #FF9900 0%, #D4AF37 100%); padding: 30px; text-align: center; color: white; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }}
    .kente-bar {{ height: 6px; background: linear-gradient(to right, #009933 25%, #FFCC00 25%, #FFCC00 50%, #FF3300 50%, #FF3300 75%, #000000 75%); }}
    .content {{ padding: 30px; }}
    .greeting {{ font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #111827; }}
    .text {{ font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 25px; }}
    .card {{ background: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 25px; border: 1px solid #e5e7eb; }}
    .card-title {{ font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }}
    .detail-row {{ display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }}
    .detail-row:last-child {{ margin-bottom: 0; }}
    .detail-label {{ color: #6b7280; font-weight: 500; }}
    .detail-value {{ color: #111827; font-weight: 600; text-align: right; }}
    .code-badge {{ background: #FF9900; color: white; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; }}
    .table-badge {{ background: #10b981; color: white; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; }}
    .footer {{ background: #f9f9fa; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }}
    .footer p {{ margin: 5px 0 0 0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reservation Confirmed!</h1>
    </div>
    <div class="kente-bar"></div>
    <div class="content">
      <div class="greeting">Congratulations, {graduate_name}!</div>
      <p class="text">
        Your table reservation for the graduation event has been successfully confirmed.
        Please review your details below and keep your reservation code handy.
      </p>
      
      <div class="card">
        <div class="card-title">Reservation Details</div>
        <div class="detail-row">
          <span class="detail-label">Reservation Code</span>
          <span class="detail-value"><span class="code-badge">{reservation_code}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Table Number</span>
          <span class="detail-value">{table_val}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Program</span>
          <span class="detail-value">{program}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Graduation Date</span>
          <span class="detail-value">{graduation_date}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Guests</span>
          <span class="detail-value">{attendees_count} guests</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount Paid</span>
          <span class="detail-value" style="color: #FF9900; font-size: 16px;">GHC {total_amount:.2f}</span>
        </div>
      </div>
      
      <p class="text" style="margin-bottom: 0;">
        We look forward to hosting you and your guests for a memorable celebration! If you have any questions, feel free to reply to this email or contact our support.
      </p>
    </div>
    <div class="footer">
      <strong>KaDel Ghana</strong>
      <p>Graduation Event Table Reservation System</p>
    </div>
  </div>
</body>
</html>"""

    plain_content = f"""Dear {graduate_name},

Your graduation table reservation has been confirmed!

Reservation Code: {reservation_code}
Table Number: {table_val_plain}
Program: {program}
Graduation Date: {graduation_date}
Guests: {attendees_count}
Total Paid: GHC {total_amount:.2f}

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
    base_cost = event_fee * booking.attendees_count
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
