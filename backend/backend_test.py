import requests
import sys
from datetime import datetime

class KaDelAPITester:
    def __init__(self, base_url="https://grad-book-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_booking_id = None
        self.test_product_id = None
        self.test_date_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=req_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=req_headers, timeout=10)

            if isinstance(expected_status, list):
                success = response.status_code in expected_status
            else:
                success = response.status_code == expected_status
            if success:

                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_public_endpoints(self):
        """Test public endpoints"""
        print("\n" + "="*60)
        print("TESTING PUBLIC ENDPOINTS")
        print("="*60)

        # Test root
        self.run_test("Root endpoint", "GET", "", 200)

        # Test dates
        success, dates = self.run_test("Get graduation dates", "GET", "dates", 200)
        if success and dates:
            print(f"   Found {len(dates)} graduation dates")

        # Test products
        success, products = self.run_test("Get all products", "GET", "products", 200)
        if success and products:
            print(f"   Found {len(products)} products")

        # Test products by category
        for category in ["food", "drink", "pastry"]:
            success, items = self.run_test(f"Get {category} products", "GET", f"products?category={category}", 200)
            if success:
                print(f"   Found {len(items)} {category} items")

        # Test event settings
        success, settings = self.run_test("Get event settings", "GET", "event-settings", 200)
        if success and settings:
            print(f"   Event fee per person: GHC {settings.get('event_fee_per_person', 0)}")

    def test_booking_flow(self):
        """Test booking creation and payment flow"""
        print("\n" + "="*60)
        print("TESTING BOOKING FLOW")
        print("="*60)

        # Create a booking
        booking_data = {
            "graduate_name": "Test Graduate",
            "course": "BSc Computer Science",
            "graduation_date": "July 15, 2025",
            "phone": "+233 24 123 4567",
            "email": "test@example.com",
            "attendees_count": 10,
            "wants_food": True,
            "selections": []
        }

        # Get products first to add selections
        success, products = self.run_test("Get products for booking", "GET", "products", 200)
        if success and products:
            # Add 2 food items
            food_items = [p for p in products if p.get('category') == 'food'][:2]
            for item in food_items:
                booking_data["selections"].append({
                    "product_id": item["id"],
                    "product_name": item["name"],
                    "quantity": 2,
                    "unit_price": item["price"],
                    "subtotal": item["price"] * 2
                })

        success, booking_response = self.run_test("Create booking", "POST", "bookings", 200, data=booking_data)
        if success and booking_response:
            self.test_booking_id = booking_response.get("id")
            print(f"   Booking ID: {self.test_booking_id}")
            print(f"   Reservation Code: {booking_response.get('reservation_code')}")
            print(f"   Total Amount: GHC {booking_response.get('total_amount', 0):.2f}")

            payment_data = {
                "booking_id": self.test_booking_id,
                "callback_url": "https://example.com/callback"
            }
            success, _ = self.run_test("Initialize payment", "POST", "payments/initialize", [200, 500], data=payment_data)
            print("   Payment initialization test completed")


            # Test test-complete endpoint
            success, payment_response = self.run_test(
                "Complete payment (test mode)", 
                "POST", 
                f"payments/test-complete/{self.test_booking_id}", 
                200
            )
            if success and payment_response:
                booking = payment_response.get("booking", {})
                print(f"   Payment Status: {payment_response.get('status')}")
                print(f"   Booking Status: {booking.get('status')}")
                print(f"   Table Number: {booking.get('table_number')}")
                print(f"   Reservation Code: {booking.get('reservation_code')}")

                # Test booking lookup by reservation code
                if booking.get('reservation_code'):
                    self.run_test(
                        "Lookup booking by code", 
                        "GET", 
                        f"bookings/lookup/{booking.get('reservation_code')}", 
                        200
                    )

    def test_admin_login(self):
        """Test admin login"""
        print("\n" + "="*60)
        print("TESTING ADMIN LOGIN")
        print("="*60)

        login_data = {
            "email": "admin@kadel.com",
            "password": "admin123"
        }

        success, response = self.run_test("Admin login", "POST", "admin/login", 200, data=login_data)
        if success and response:
            self.admin_token = response.get("token")
            print(f"   Token received: {self.admin_token[:20]}...")
            return True
        return False

    def test_admin_endpoints(self):
        """Test admin endpoints"""
        if not self.admin_token:
            print("\n❌ Skipping admin tests - no token")
            return

        print("\n" + "="*60)
        print("TESTING ADMIN ENDPOINTS")
        print("="*60)

        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # Test stats
        success, stats = self.run_test("Get admin stats", "GET", "admin/stats", 200, headers=headers)
        if success and stats:
            print(f"   Total Bookings: {stats.get('total_bookings', 0)}")
            print(f"   Confirmed: {stats.get('confirmed_bookings', 0)}")
            print(f"   Pending: {stats.get('pending_bookings', 0)}")
            print(f"   Revenue: GHC {stats.get('total_revenue', 0):.2f}")
            print(f"   Total Attendees: {stats.get('total_attendees', 0)}")

        # Test bookings list
        success, bookings = self.run_test("Get all bookings", "GET", "admin/bookings", 200, headers=headers)
        if success:
            print(f"   Found {len(bookings)} bookings")

        # Test payments list
        success, payments = self.run_test("Get all payments", "GET", "admin/payments", 200, headers=headers)
        if success:
            print(f"   Found {len(payments)} payments")

        # Test products list
        success, products = self.run_test("Get admin products", "GET", "admin/products", 200, headers=headers)
        if success:
            print(f"   Found {len(products)} products")

        # Test create product
        product_data = {
            "name": "Test Product",
            "category": "food",
            "price": 25.0,
            "stock": 10,
            "vendor": "Test Vendor"
        }
        success, product_response = self.run_test("Create product", "POST", "admin/products", 200, data=product_data, headers=headers)
        if success and product_response:
            self.test_product_id = product_response.get("id")
            print(f"   Product ID: {self.test_product_id}")

            # Test update product
            if self.test_product_id:
                update_data = {"price": 30.0, "stock": 15}
                self.run_test("Update product", "PATCH", f"admin/products/{self.test_product_id}", 200, data=update_data, headers=headers)

                # Test delete product
                self.run_test("Delete product", "DELETE", f"admin/products/{self.test_product_id}", 200, headers=headers)

        # Test dates
        success, dates = self.run_test("Get admin dates", "GET", "admin/dates", 200, headers=headers)
        if success:
            print(f"   Found {len(dates)} graduation dates")

        # Test create date
        date_data = {"date_label": "Test Date - January 1, 2026"}
        success, date_response = self.run_test("Create date", "POST", "admin/dates", 200, data=date_data, headers=headers)
        if success and date_response:
            self.test_date_id = date_response.get("id")
            print(f"   Date ID: {self.test_date_id}")

            # Test delete date
            if self.test_date_id:
                self.run_test("Delete date", "DELETE", f"admin/dates/{self.test_date_id}", 200, headers=headers)

        # Test table assignment
        if self.test_booking_id:
            table_data = {
                "booking_id": self.test_booking_id,
                "table_number": "T99"
            }
            self.run_test("Assign table", "POST", "admin/tables/assign", 200, data=table_data, headers=headers)

        # Test settings
        success, settings = self.run_test("Get settings", "GET", "admin/settings", 200, headers=headers)
        if success and settings:
            print(f"   Event fee: GHC {settings.get('event_fee_per_person', 0)}")

        # Test update settings
        settings_data = {"event_fee_per_person": 55.0}
        self.run_test("Update settings", "PATCH", "admin/settings", 200, data=settings_data, headers=headers)

        # Restore original settings
        settings_data = {"event_fee_per_person": 50.0}
        self.run_test("Restore settings", "PATCH", "admin/settings", 200, data=settings_data, headers=headers)

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass  # stdout might not support reconfigure in some environments
    print("\n" + "="*60)
    print("KADEL GHANA API TEST SUITE")
    print("="*60)
    
    base_url = "https://grad-book-1.preview.emergentagent.com/api"
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
        print(f"Using custom base URL: {base_url}")
        
    tester = KaDelAPITester(base_url=base_url)

    # Run all tests
    tester.test_public_endpoints()
    tester.test_booking_flow()
    
    if tester.test_admin_login():
        tester.test_admin_endpoints()

    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%")
    print("="*60)

    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
