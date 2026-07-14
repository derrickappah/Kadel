import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2, Mail, Lock, Sun, Moon, ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("admin_theme") || "light");

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("admin_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === "light" ? "dark" : "light");
  };

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
    <div className="min-h-screen bg-background hero-gradient flex items-center justify-center p-4 transition-colors duration-300 relative overflow-hidden">
      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="rounded-xl bg-card border-border/80 shadow-sm hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[400px]"
      >
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
            KaDel
          </h1>
          <p className="text-sm font-semibold text-muted-foreground mt-1.5 uppercase tracking-widest">
            Admin Portal
          </p>
          <div className="kente-bar w-20 mx-auto mt-4" />
        </div>

        <Card className="border-border/80 shadow-2xl rounded-3xl overflow-hidden bg-card/85 backdrop-blur-md">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-xl text-center font-bold text-foreground">
              Sign In
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@kadel.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    data-testid="admin-email-input"
                    className="h-11 pl-10 rounded-xl border-border/85 focus:border-primary focus:ring-1 focus:ring-primary/20 text-base sm:text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="admin-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    data-testid="admin-password-input"
                    className="h-11 pl-10 rounded-xl border-border/85 focus:border-primary focus:ring-1 focus:ring-primary/20 text-base sm:text-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground mt-2 active:scale-98 transition-all"
                disabled={loading}
                data-testid="admin-login-button"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to main website</span>
          </button>
        </p>
      </motion.div>
    </div>
  );
}
