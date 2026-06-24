from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
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

# Supabase connection
supabase_url = os.environ['SUPABASE_URL']
supabase_key = os.environ['SUPABASE_KEY']

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
    """Send email confirmation - requires SMTP config in .env"""
    smtp_host = os.environ.get('SMTP_HOST', '')
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    if not smtp_host or not smtp_user:
        logger.info(f"Email not configured. Confirmation for {booking.get('reservation_code')} logged only.")
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = booking['email']
        msg['Subject'] = f"Graduation Booking Confirmed - {booking['reservation_code']}"
        body = f"""Dear {booking['graduate_name']},\n\nYour graduation event booking has been confirmed!\n\nReservation Code: {booking['reservation_code']}\nTable Number: {booking.get('table_number', 'Pending')}\nGuests: {booking['attendees_count']}\nTotal Paid: GHC {booking['total_amount']:.2f}\n\nPlease save your reservation code for check-in.\n\nCongratulations on your graduation!\n\n- KaDel Ghana"""
        msg.attach(MIMEText(body, 'plain'))
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Confirmation email sent to {booking['email']}")
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False

# ==================== STARTUP ====================

supabase: AsyncClient = None

@app.on_event("startup")
async def startup():
    global supabase
    supabase = await create_async_client(supabase_url, supabase_key)
    logger.info("Supabase AsyncClient initialized successfully")

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
