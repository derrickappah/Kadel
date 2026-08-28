import unittest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
import sys
from pathlib import Path

# Mock supabase library before server.py is imported if not installed
if 'supabase' not in sys.modules:
    mock_supabase_mod = MagicMock()
    mock_supabase_mod.create_async_client = MagicMock()
    mock_supabase_mod.AsyncClient = MagicMock
    sys.modules['supabase'] = mock_supabase_mod

sys.path.insert(0, str(Path(__file__).parent))

import server

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

class TestAuthSecurity(unittest.TestCase):

    def test_get_current_admin_fail_closed_when_empty_config(self):
        """Verify get_current_admin strictly rejects non-admin users when ADMIN_EMAILS is empty"""
        mock_request = MagicMock()
        mock_request.headers = {"Authorization": "Bearer mock_valid_token"}

        # Mock Supabase user with normal role
        mock_user = MagicMock()
        mock_user.email = "regular_user@example.com"
        mock_user.id = "user_123"
        mock_user.app_metadata = {"role": "authenticated"}
        mock_user.user_metadata = {}

        mock_res = MagicMock()
        mock_res.user = mock_user

        with patch.object(server, 'supabase') as mock_sb, patch.dict('os.environ', {'ADMIN_EMAILS': ''}):
            mock_sb.auth.get_user = AsyncMock(return_value=mock_res)
            
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(server.get_current_admin(mock_request))
            
            self.assertEqual(ctx.exception.status_code, 403)
            self.assertIn("administrator privileges required", ctx.exception.detail)
            print("  [PASS] Verified: get_current_admin fails closed when ADMIN_EMAILS is empty and role is not admin.")

    def test_get_current_admin_accepts_explicit_admin_role(self):
        """Verify get_current_admin accepts user with explicit 'admin' role in app_metadata"""
        mock_request = MagicMock()
        mock_request.headers = {"Authorization": "Bearer mock_valid_token"}

        mock_user = MagicMock()
        mock_user.email = "sysadmin@example.com"
        mock_user.id = "admin_123"
        mock_user.app_metadata = {"role": "admin"}
        mock_user.user_metadata = {}

        mock_res = MagicMock()
        mock_res.user = mock_user

        with patch.object(server, 'supabase') as mock_sb, patch.dict('os.environ', {'ADMIN_EMAILS': ''}):
            mock_sb.auth.get_user = AsyncMock(return_value=mock_res)
            
            admin_data = asyncio.run(server.get_current_admin(mock_request))
            self.assertEqual(admin_data["role"], "admin")
            self.assertEqual(admin_data["email"], "sysadmin@example.com")
            print("  [PASS] Verified: get_current_admin accepts users with explicit 'admin' app_metadata role.")

    def test_get_current_admin_accepts_configured_email(self):
        """Verify get_current_admin accepts users whose email is listed in ADMIN_EMAILS"""
        mock_request = MagicMock()
        mock_request.headers = {"Authorization": "Bearer mock_valid_token"}

        mock_user = MagicMock()
        mock_user.email = "authorized_admin@kadelgh.com"
        mock_user.id = "admin_456"
        mock_user.app_metadata = {}
        mock_user.user_metadata = {}

        mock_res = MagicMock()
        mock_res.user = mock_user

        with patch.object(server, 'supabase') as mock_sb, patch.dict('os.environ', {'ADMIN_EMAILS': 'authorized_admin@kadelgh.com,ops@kadelgh.com'}):
            mock_sb.auth.get_user = AsyncMock(return_value=mock_res)
            
            admin_data = asyncio.run(server.get_current_admin(mock_request))
            self.assertEqual(admin_data["email"], "authorized_admin@kadelgh.com")
            print("  [PASS] Verified: get_current_admin authorizes emails specified in ADMIN_EMAILS.")

    def test_admin_login_rate_limiting_by_account(self):
        """Verify admin_login enforces account-level rate limits across different IP addresses"""
        server._rate_limit_records.clear()
        
        mock_request = MagicMock()
        mock_request.client.host = "1.2.3.4"
        mock_request.headers = {}

        data = server.AdminLoginReq(email="victim_admin@kadel.com", password="wrong_password")

        with patch.object(server, 'supabase') as mock_sb:
            mock_sb.auth.sign_in_with_password = AsyncMock(side_effect=Exception("Invalid credentials"))
            
            # 5 allowed attempts
            for i in range(5):
                mock_request.client.host = f"10.0.0.{i}" # Rotate IPs to simulate distributed attack
                with self.assertRaises(HTTPException) as ctx:
                    asyncio.run(server.admin_login(data, mock_request))
                self.assertEqual(ctx.exception.status_code, 401)
            
            # 6th attempt from a fresh IP should be blocked by account limiter (429)
            mock_request.client.host = "10.0.0.99"
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(server.admin_login(data, mock_request))
            self.assertEqual(ctx.exception.status_code, 429)
            self.assertIn("Too many failed attempts for this account", ctx.exception.detail)
            print("  [PASS] Verified: Admin login locks out targeted account even when requests originate from rotating IPs.")

    def test_webhook_replay_protection(self):
        """Verify webhook rejects stale/expired timestamps"""
        import time
        mock_request = MagicMock()
        mock_request.headers = {
            "x-moolre-signature": "dummy_sig",
            "x-moolre-timestamp": str(time.time() - 400) # 400 seconds old (> 300s threshold)
        }
        mock_request.body = AsyncMock(return_value=b'{"status": 1}')

        with patch.object(server, 'MOOLRE_PRIVATE_KEY', 'test_secret'):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(server.moolre_webhook(mock_request))
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("Webhook timestamp expired", ctx.exception.detail)
            print("  [PASS] Verified: Moolre webhook rejects replayed payloads with stale timestamps.")

if __name__ == '__main__':
    unittest.main()
