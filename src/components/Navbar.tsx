import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, User as UserIcon, LogIn, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";
import WalletWidget from "@/components/WalletWidget";
import CartWidget from "@/components/CartWidget";
import NotificationBell from "@/components/notifications/NotificationBell";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const { theme } = useTheme();
  const { settings } = usePlatformSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const logoUrl =
    theme === "dark"
      ? (settings.logo_dark_url || "/logo-dark.png")
      : (settings.logo_light_url || "/logo-light.png");


  const links = [
    { label: "الرئيسية", href: "/" },
    { label: "المميزات", href: "/#features" },
    { label: "الدورات", href: "/courses" },
    { label: "الباقات", href: "/bundles" },
    { label: "الكتب", href: "/books" },
    { label: "أماكن التواجد", href: "/branches" },
    { label: "المتصدرين", href: "/leaderboard" },
    { label: "تفعيل كود", href: "/redeem" },
  ];

  const handleNav = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    setOpen(false);
    const [path, hash] = href.split("#");
    const targetPath = path || "/";
    const scrollToHash = () => {
      if (!hash) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Wait a tick for the target route to render
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    if (location.pathname !== targetPath) {
      navigate(targetPath + (hash ? `#${hash}` : ""));
      setTimeout(scrollToHash, 60);
    } else {
      scrollToHash();
    }
  };



  const handleSignOut = async () => {
    await signOut();
    toast.success("تم تسجيل الخروج");
    navigate("/");
    setOpen(false);
  };

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("") || user?.email?.[0]?.toUpperCase() || "؟";

  const AuthArea = () => {
    if (user) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full hover:bg-secondary transition-colors p-1 pl-3">
              <Avatar className="w-9 h-9 border border-border">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm font-semibold max-w-[120px] truncate">
                {profile?.full_name || "حسابي"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal">
              <div className="font-bold">{profile?.full_name || "مستخدم"}</div>
              <div className="text-muted-foreground truncate" dir="ltr">
                {profile?.phone_number || profile?.email || (user.email && !user.email.endsWith("@phone.noemail.invalid") ? user.email : "")}
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />
            {profile?.role === "admin" ? (
              <DropdownMenuItem onClick={() => { navigate("/admin"); setOpen(false); }} className="gap-2">
                <LayoutDashboard className="w-4 h-4" />
                لوحة الإدارة
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => { navigate("/dashboard"); setOpen(false); }} className="gap-2">
                <LayoutDashboard className="w-4 h-4" />
                لوحتي
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                navigate(profile?.role === "admin" ? "/admin/account" : "/dashboard/account");
                setOpen(false);
              }}
              className="gap-2"
            >
              <UserIcon className="w-4 h-4" />
              الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Link to="/login">
          <Button variant="ghost" size="sm" className="gap-1 font-bold">
            <LogIn className="w-4 h-4" />
            دخول
          </Button>
        </Link>
        <Link to="/signup">
          <Button size="sm" className="font-bold">
            إنشاء حساب
          </Button>
        </Link>
      </div>
    );
  };

  const dashboardPath =
    profile?.role === "admin"
      ? "/admin"
      : profile?.role === "parent"
        ? "/parent"
        : "/dashboard";

  return (
    <nav className="sticky top-0 right-0 left-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-2.5">
      <div className="container mx-auto flex items-center justify-between min-h-[4.5rem]">
        <Link to="/" className="flex items-center group py-1">
          <img src={logoUrl} alt="منصة الأستاذة منى كامل" className="h-16 sm:h-20 md:h-24 w-auto max-h-24 object-contain transition-transform group-hover:scale-105" />
        </Link>

        <div className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => handleNav(e, l.href)}
              className="text-foreground/80 hover:text-primary transition-colors cursor-pointer py-1 font-semibold"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {user && profile?.role !== "admin" && <WalletWidget to="/dashboard/wallet" />}
          {user && profile?.role === "admin" && <WalletWidget to="/admin/wallets" />}
          {user && <CartWidget />}
          {user && <NotificationBell />}
          <AuthArea />
        </div>

        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          {user && <WalletWidget to={profile?.role === "admin" ? "/admin/wallets" : "/dashboard/wallet"} />}
          {user && <CartWidget />}
          {user && <NotificationBell />}

          {user && (
            <Link
              to={dashboardPath}
              title={profile?.role === "admin" ? "لوحة الإدارة" : "لوحة التحكم"}
              className="relative group focus:outline-none"
            >
              <Avatar className="w-9 h-9 border-2 border-primary/40 group-hover:border-primary group-active:scale-95 transition-all shadow-sm">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary text-primary-foreground rounded-full border border-background flex items-center justify-center text-[8px] font-bold shadow-sm">
                <LayoutDashboard size={8} />
              </span>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-border bg-background overflow-hidden"
          >
            <div className="p-4 space-y-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => handleNav(e, l.href)}
                  className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-3 mt-3 border-t border-border">
                {user ? (
                  <div className="space-y-2">
                    <Link
                      to={dashboardPath}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent/60 transition-colors"
                    >
                      <Avatar className="w-10 h-10 border-2 border-primary/30">
                        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                          <span>{profile?.full_name || "مستخدم"}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                            {profile?.role === "admin" ? "مدير" : profile?.role === "parent" ? "ولي أمر" : "طالب"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate" dir="ltr">
                          {profile?.phone_number || profile?.email || (user.email && !user.email.endsWith("@phone.noemail.invalid") ? user.email : "")}
                        </div>
                      </div>
                    </Link>
                    <Link to={dashboardPath} onClick={() => setOpen(false)}>
                      <Button variant="secondary" size="sm" className="w-full gap-2 font-bold">
                        <LayoutDashboard className="w-4 h-4" />
                        {profile?.role === "admin" ? "لوحة الإدارة" : "لوحة التحكم"}
                      </Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={handleSignOut} className="w-full gap-2">
                      <LogOut className="w-4 h-4" />
                      تسجيل الخروج
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link to="/login" onClick={() => setOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full gap-2 font-bold">
                        <LogIn className="w-4 h-4" />
                        تسجيل الدخول
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setOpen(false)}>
                      <Button size="sm" className="w-full font-bold">
                        إنشاء حساب
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
