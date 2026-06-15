from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
from jose import jwt, JWTError
from passlib.context import CryptContext
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'gradtable_db')]

# Config
PAYSTACK_SECRET_KEY = os.environ.get('PAYSTACK_SECRET_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'gradtable-jwt-secret-2024')
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    if '_id' in result:
        del result['_id']
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result

def create_jwt_token(data: dict):
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(401, "Invalid token")

async def auto_assign_table():
    last_booking = await db.bookings.find(
        {"table_number": {"$ne": None}}
    ).sort("created_at", -1).limit(1).to_list(1)
    if last_booking and last_booking[0].get("table_number"):
        try:
            last_num = int(last_booking[0]["table_number"].replace("T", ""))
            return f"T{last_num + 1}"
        except (ValueError, AttributeError):
            pass
    return "T1"

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
        body = f"""Dear {booking['graduate_name']},\n\nYour graduation event booking has been confirmed!\n\nReservation Code: {booking['reservation_code']}\nTable Number: {booking.get('table_number', 'Pending')}\nGuests: {booking['attendees_count']}\nTotal Paid: GHC {booking['total_amount']:.2f}\n\nPlease save your reservation code for check-in.\n\nCongratulations on your graduation!\n\n- GradTable Ghana"""
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

@app.on_event("startup")
async def startup():
    # Seed admin
    admin = await db.admins.find_one({"email": "admin@gradtable.com"})
    if not admin:
        await db.admins.insert_one({
            "id": str(uuid.uuid4()),
            "email": "admin@gradtable.com",
            "password_hash": pwd_context.hash("admin123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Admin seeded: admin@gradtable.com / admin123")

    # Seed event settings
    settings = await db.event_settings.find_one({"key": "settings"})
    if not settings:
        await db.event_settings.insert_one({"key": "settings", "event_fee_per_person": 50.0})

    # Seed graduation dates
    if await db.graduation_dates.count_documents({}) == 0:
        await db.graduation_dates.insert_many([
            {"id": str(uuid.uuid4()), "date_label": "July 15, 2025", "is_active": True},
            {"id": str(uuid.uuid4()), "date_label": "August 20, 2025", "is_active": True},
            {"id": str(uuid.uuid4()), "date_label": "December 10, 2025", "is_active": True},
        ])

    # Seed products
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([
            {"id": str(uuid.uuid4()), "name": "Fried Rice", "category": "food", "price": 50.0, "stock": 20, "vendor": "Chef Kwame", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Jollof Rice", "category": "food", "price": 45.0, "stock": 25, "vendor": "Chef Kwame", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Waakye", "category": "food", "price": 40.0, "stock": 30, "vendor": "Mama Akua", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Banku & Tilapia", "category": "food", "price": 55.0, "stock": 15, "vendor": "Mama Akua", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Coca Cola", "category": "drink", "price": 10.0, "stock": 50, "vendor": "Drinks Plus", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Fanta Orange", "category": "drink", "price": 10.0, "stock": 50, "vendor": "Drinks Plus", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Malta Guinness", "category": "drink", "price": 12.0, "stock": 40, "vendor": "Drinks Plus", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Bottled Water", "category": "drink", "price": 5.0, "stock": 100, "vendor": "Drinks Plus", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Meat Pie", "category": "pastry", "price": 15.0, "stock": 30, "vendor": "Sweet Bakes", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Doughnut", "category": "pastry", "price": 8.0, "stock": 40, "vendor": "Sweet Bakes", "is_active": True},
            {"id": str(uuid.uuid4()), "name": "Cake Slice", "category": "pastry", "price": 20.0, "stock": 20, "vendor": "Sweet Bakes", "is_active": True},
        ])
    logger.info("Database seeded successfully")

# ==================== PUBLIC ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "GradTable Ghana API"}

@api_router.get("/dates")
async def get_dates():
    dates = await db.graduation_dates.find({"is_active": True}, {"_id": 0}).to_list(100)
    return dates

@api_router.get("/products")
async def get_products(category: Optional[str] = None):
    query = {"is_active": True}
    if category:
        query["category"] = category
    products = await db.products.find(query, {"_id": 0}).to_list(100)
    return products

@api_router.get("/event-settings")
async def get_event_settings():
    settings = await db.event_settings.find_one({"key": "settings"}, {"_id": 0})
    return settings or {"event_fee_per_person": 50.0}

@api_router.post("/bookings")
async def create_booking(booking: BookingCreate):
    settings = await db.event_settings.find_one({"key": "settings"})
    event_fee = settings.get("event_fee_per_person", 50.0) if settings else 50.0
    base_cost = event_fee * booking.attendees_count
    food_cost = sum(s.subtotal for s in booking.selections)
    total = base_cost + food_cost

    # Validate stock
    for sel in booking.selections:
        product = await db.products.find_one({"id": sel.product_id})
        if not product:
            raise HTTPException(400, f"Product {sel.product_name} not found")
        if product["stock"] < sel.quantity:
            raise HTTPException(400, f"Insufficient stock for {sel.product_name}. Only {product['stock']} available.")

    reservation_code = generate_reservation_code()
    while await db.bookings.find_one({"reservation_code": reservation_code}):
        reservation_code = generate_reservation_code()

    booking_doc = {
        "id": str(uuid.uuid4()),
        "graduate_name": booking.graduate_name,
        "course": booking.course,
        "graduation_date": booking.graduation_date,
        "phone": booking.phone,
        "email": booking.email,
        "attendees_count": booking.attendees_count,
        "wants_food": booking.wants_food,
        "selections": [s.model_dump() for s in booking.selections],
        "base_cost": base_cost,
        "food_cost": food_cost,
        "total_amount": total,
        "event_fee_per_person": event_fee,
        "status": "pending",
        "reservation_code": reservation_code,
        "table_number": None,
        "payment_reference": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bookings.insert_one(booking_doc)
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
    booking = await db.bookings.find_one({"id": data.booking_id})
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
        await db.payments.insert_one({
            "id": str(uuid.uuid4()),
            "booking_id": data.booking_id,
            "reference": result["data"]["reference"],
            "amount": booking["total_amount"],
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.bookings.update_one(
            {"id": data.booking_id},
            {"$set": {"payment_reference": result["data"]["reference"]}}
        )
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
        await db.payments.update_one(
            {"reference": reference},
            {"$set": {"status": "success", "verified_at": datetime.now(timezone.utc).isoformat()}}
        )
        payment = await db.payments.find_one({"reference": reference})
        if payment:
            booking = await db.bookings.find_one({"id": payment["booking_id"]})
            if booking and booking["status"] != "confirmed":
                for sel in booking.get("selections", []):
                    await db.products.update_one(
                        {"id": sel["product_id"]},
                        {"$inc": {"stock": -sel["quantity"]}}
                    )
                table_number = await auto_assign_table()
                await db.bookings.update_one(
                    {"id": payment["booking_id"]},
                    {"$set": {"status": "confirmed", "table_number": table_number}}
                )
                updated = await db.bookings.find_one({"id": payment["booking_id"]}, {"_id": 0})
                # Try sending email
                await send_confirmation_email(updated)
                return {"status": "success", "booking": serialize_doc(updated)}
        return {"status": "success", "message": "Payment verified"}
    # Check if already confirmed
    payment = await db.payments.find_one({"reference": reference})
    if payment and payment.get("status") == "success":
        booking = await db.bookings.find_one({"id": payment["booking_id"]}, {"_id": 0})
        return {"status": "success", "booking": serialize_doc(booking)}
    return {"status": "failed", "message": "Payment verification failed"}

# Test endpoint for development - simulates payment completion
@api_router.post("/payments/test-complete/{booking_id}")
async def test_complete_payment(booking_id: str):
    """DEV ONLY: Simulates payment completion for testing without Paystack keys"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking["status"] == "confirmed":
        return {"status": "already_confirmed", "booking": serialize_doc(booking)}

    reference = f"TEST_{uuid.uuid4().hex[:12]}"
    # Create payment record
    await db.payments.insert_one({
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "reference": reference,
        "amount": booking["total_amount"],
        "status": "success",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    # Deduct stock
    for sel in booking.get("selections", []):
        await db.products.update_one(
            {"id": sel["product_id"]},
            {"$inc": {"stock": -sel["quantity"]}}
        )
    table_number = await auto_assign_table()
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "confirmed", "table_number": table_number, "payment_reference": reference}}
    )
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
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
    booking = await db.bookings.find_one({"reservation_code": reservation_code}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    return serialize_doc(booking)

# ==================== ADMIN ROUTES ====================

@api_router.post("/admin/login")
async def admin_login(data: AdminLoginReq):
    admin = await db.admins.find_one({"email": data.email})
    if not admin or not pwd_context.verify(data.password, admin["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_jwt_token({"email": admin["email"], "id": admin.get("id", "")})
    return {"token": token, "email": admin["email"]}

@api_router.get("/admin/stats")
async def admin_get_stats(admin=Depends(get_current_admin)):
    total_bookings = await db.bookings.count_documents({})
    confirmed = await db.bookings.count_documents({"status": "confirmed"})
    pending = await db.bookings.count_documents({"status": "pending"})
    pipeline = [
        {"$match": {"status": "confirmed"}},
        {"$group": {"_id": None, "revenue": {"$sum": "$total_amount"}, "attendees": {"$sum": "$attendees_count"}}}
    ]
    agg = await db.bookings.aggregate(pipeline).to_list(1)
    revenue = agg[0]["revenue"] if agg else 0
    attendees = agg[0]["attendees"] if agg else 0
    return {
        "total_bookings": total_bookings,
        "confirmed_bookings": confirmed,
        "pending_bookings": pending,
        "total_revenue": revenue,
        "total_attendees": attendees
    }

@api_router.get("/admin/bookings")
async def admin_get_bookings(admin=Depends(get_current_admin)):
    bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(b) for b in bookings]

@api_router.get("/admin/payments")
async def admin_get_payments(admin=Depends(get_current_admin)):
    payments = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(p) for p in payments]

@api_router.get("/admin/products")
async def admin_get_products(admin=Depends(get_current_admin)):
    products = await db.products.find({}, {"_id": 0}).to_list(100)
    return products

@api_router.post("/admin/products")
async def admin_create_product(product: ProductCreate, admin=Depends(get_current_admin)):
    doc = product.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["is_active"] = True
    await db.products.insert_one(doc)
    return {"id": doc["id"], "message": "Product created"}

@api_router.patch("/admin/products/{product_id}")
async def admin_update_product(product_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"name", "category", "price", "stock", "vendor", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    result = await db.products.update_one({"id": product_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return {"message": "Product updated"}

@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin=Depends(get_current_admin)):
    await db.products.delete_one({"id": product_id})
    return {"message": "Product deleted"}

@api_router.get("/admin/dates")
async def admin_get_dates(admin=Depends(get_current_admin)):
    dates = await db.graduation_dates.find({}, {"_id": 0}).to_list(100)
    return dates

@api_router.post("/admin/dates")
async def admin_create_date(data: dict, admin=Depends(get_current_admin)):
    doc = {"id": str(uuid.uuid4()), "date_label": data.get("date_label", ""), "is_active": True}
    await db.graduation_dates.insert_one(doc)
    return {"id": doc["id"], "message": "Date created"}

@api_router.patch("/admin/dates/{date_id}")
async def admin_update_date(date_id: str, data: dict, admin=Depends(get_current_admin)):
    allowed = {"date_label", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    result = await db.graduation_dates.update_one({"id": date_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Date not found")
    return {"message": "Date updated"}

@api_router.delete("/admin/dates/{date_id}")
async def admin_delete_date(date_id: str, admin=Depends(get_current_admin)):
    await db.graduation_dates.delete_one({"id": date_id})
    return {"message": "Date deleted"}

@api_router.post("/admin/tables/assign")
async def admin_assign_table(data: TableAssign, admin=Depends(get_current_admin)):
    result = await db.bookings.update_one(
        {"id": data.booking_id},
        {"$set": {"table_number": data.table_number}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Booking not found")
    return {"message": f"Table {data.table_number} assigned"}

@api_router.get("/admin/settings")
async def admin_get_settings(admin=Depends(get_current_admin)):
    settings = await db.event_settings.find_one({"key": "settings"}, {"_id": 0})
    return settings or {"event_fee_per_person": 50.0}

@api_router.patch("/admin/settings")
async def admin_update_settings(data: dict, admin=Depends(get_current_admin)):
    allowed = {"event_fee_per_person"}
    update = {k: v for k, v in data.items() if k in allowed}
    update["key"] = "settings"
    await db.event_settings.update_one({"key": "settings"}, {"$set": update}, upsert=True)
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
    client.close()
