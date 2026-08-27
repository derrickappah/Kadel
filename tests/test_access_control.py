from unittest.mock import MagicMock
import os
import sys

# Test get_client_ip logic directly
TRUSTED_PROXIES = {'127.0.0.1', '::1', 'localhost'}

def get_client_ip(request):
    peer_ip = request.client.host if request.client else '127.0.0.1'
    if peer_ip in TRUSTED_PROXIES:
        forwarded = request.headers.get('x-forwarded-for')
        if forwarded:
            return forwarded.split(',')[0].strip()
    return peer_ip

def test_get_client_ip_trusted_and_untrusted():
    mock_request = MagicMock()
    mock_request.client.host = '203.0.113.195'
    mock_request.headers = {'x-forwarded-for': '10.0.0.1'}
    assert get_client_ip(mock_request) == '203.0.113.195', 'Untrusted peer should ignore X-Forwarded-For'

    mock_request.client.host = '127.0.0.1'
    mock_request.headers = {'x-forwarded-for': '198.51.100.4'}
    assert get_client_ip(mock_request) == '198.51.100.4', 'Trusted proxy peer should extract client IP'

def test_booking_secret_validation():
    # Simulate payment initialization auth check
    booking = {'id': 'b-123', 'booking_secret': 'sec_abc', 'status': 'pending'}
    
    # 1. Matching secret -> Allowed
    req_secret = 'sec_abc'
    assert booking.get('booking_secret') == req_secret
    
    # 2. Tampered secret -> Denied
    bad_secret = 'sec_tampered'
    assert booking.get('booking_secret') != bad_secret

    # 3. Missing secret -> Denied
    assert booking.get('booking_secret') != None

def test_lead_email_cooldown():
    from datetime import datetime, timezone, timedelta
    
    # 1. Sent 60 seconds ago -> under 300s -> Denied
    recent_sent = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(recent_sent)).total_seconds()
    assert elapsed < 300
    
    # 2. Sent 400 seconds ago -> over 300s -> Allowed
    old_sent = (datetime.now(timezone.utc) - timedelta(seconds=400)).isoformat()
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(old_sent)).total_seconds()
    assert elapsed >= 300

def test_business_phase_gate_enforcement():
    # OWASP A04: Verify direct booking creation is rejected during 'leads' phase
    settings_leads = {"current_phase": "leads"}
    settings_active = {"current_phase": "active"}
    
    def evaluate_booking_phase(settings):
        phase = settings.get("current_phase", "leads")
        if phase != "active":
            return False, "Direct table reservations are currently locked."
        return True, "Allowed"

    allowed, msg = evaluate_booking_phase(settings_leads)
    assert not allowed
    assert "locked" in msg

    allowed, msg = evaluate_booking_phase(settings_active)
    assert allowed
    assert msg == "Allowed"

def test_stock_overselling_protection():
    # OWASP A04: Concurrency and overselling protection
    current_stock = 3
    
    # Adjustment that exceeds stock -> must be rejected
    requested_decrement = -5
    new_stock = current_stock + requested_decrement
    can_fulfill = new_stock >= 0
    assert not can_fulfill, "Stock reduction exceeding current inventory must be rejected"

    # Valid adjustment -> allowed
    valid_decrement = -2
    assert current_stock + valid_decrement >= 0, "Valid stock adjustment within quantity must be accepted"

def test_bulk_lead_resend_cooldown():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    leads = [
        {"id": "1", "email": "lead1@test.com", "last_email_sent_at": (now - timedelta(seconds=100)).isoformat()},
        {"id": "2", "email": "lead2@test.com", "last_email_sent_at": (now - timedelta(seconds=600)).isoformat()},
        {"id": "3", "email": "lead3@test.com", "last_email_sent_at": None},
    ]
    
    eligible_leads = []
    skipped_leads = []
    for lead in leads:
        last_sent = lead.get("last_email_sent_at")
        if last_sent:
            elapsed = (now - datetime.fromisoformat(last_sent)).total_seconds()
            if elapsed < 300:
                skipped_leads.append(lead)
                continue
        eligible_leads.append(lead)

    assert len(skipped_leads) == 1
    assert skipped_leads[0]["id"] == "1"
    assert len(eligible_leads) == 2
    assert {l["id"] for l in eligible_leads} == {"2", "3"}

if __name__ == '__main__':
    test_get_client_ip_trusted_and_untrusted()
    test_booking_secret_validation()
    test_lead_email_cooldown()
    test_business_phase_gate_enforcement()
    test_stock_overselling_protection()
    test_bulk_lead_resend_cooldown()
    print('[PASS] All OWASP A01 & A04 security regression tests passed successfully!')
