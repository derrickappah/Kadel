import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogIn, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/admin/login`, { email, password });
      localStorage.setItem("admin_token", res.data.token);
      localStorage.setItem("admin_email", res.data.email);
      toast.success("Login successful");
      navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="font-display text-2xl font-semibold">KaDel</span>
          </div>
          <p className="text-sm text-muted-foreground">Admin Panel</p>
          <div className="kente-bar w-16 mx-auto mt-3" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg text-center">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@kadel.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  data-testid="admin-email-input"
                />
              </div>
              <div>
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  data-testid="admin-password-input"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl" disabled={loading} data-testid="admin-login-button">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <button onClick={() => navigate('/')} className="hover:text-foreground underline">Back to website</button>
        </p>
      </motion.div>
    </div>
  );
}
