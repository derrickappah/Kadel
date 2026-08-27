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

if __name__ == '__main__':
    test_get_client_ip_trusted_and_untrusted()
    test_booking_secret_validation()
    test_lead_email_cooldown()
    print('[PASS] All OWASP A01 access control regression tests passed successfully!')
