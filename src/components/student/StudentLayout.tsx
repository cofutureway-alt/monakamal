import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Award, BarChart3, BookOpen, ClipboardEdit, ClipboardList, Home, Layers, LogOut, Menu, ShoppingBag, UserCircle2, Wallet, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";
import WalletWidget from "@/components/WalletWidget";
import { useTheme } from "@/contexts/ThemeContext";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

const nav = [
  { to: "/dashboard", label: "دوراتي", icon: BookOpen, end: true },
  { to: "/dashboard/wallet", label: "المحفظة", icon: Wallet },
  { to: "/dashboard/quiz-attempts", label: "محاولات اختباراتي", icon: ClipboardList },
  { to: "/dashboard/assignment-submissions", label: "واجباتي", icon: ClipboardEdit },
  { to: "/dashboard/book-orders", label: "طلباتي من الكتب", icon: ShoppingBag },
  { to: "/dashboard/badges", label: "شاراتي", icon: Award },
  { to: "/dashboard/levels", label: "المستويات", icon: Layers },
  { to: "/dashboard/statistics", label: "الإحصائيات", icon: BarChart3 },
  { to: "/dashboard/account", label: "الملف الشخصي", icon: UserCircle2 },
];

const NavItem = ({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof BarChart3;
  end?: boolean;
  onNavigate?: () => void;
}) => (
  <NavLink
    to={to}
    end={end}
    onClick={onNavigate}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
        isActive
          ? "text-primary-foreground"
          : "text-foreground/70 hover:bg-accent hover:text-foreground"
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <motion.span
            layoutId="student-nav-active"
            className="absolute inset-0 rounded-xl bg-primary -z-10"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <Icon className="w-5 h-5 shrink-0" />
        <span>{label}</span>
      </>
    )}
  </NavLink>
);

const SidebarInner = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { theme } = useTheme();
  const { settings } = usePlatformSettings();
  const logoUrl =
    theme === "dark"
      ? (settings.logo_dark_url || "/logo-dark.png")
      : (settings.logo_light_url || "/logo-light.png");

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-6 border-b border-border/60">
        <NavLink to="/" className="flex items-center gap-3">
          <img src={logoUrl} alt="منصة الأستاذة منى كامل" className="h-10 w-auto object-contain" />
          <div>
            <div className="font-bold text-foreground leading-tight">لوحة الطالب</div>
            <div className="text-xs text-muted-foreground">رحلتك التعليمية</div>
          </div>
        </NavLink>
      </div>
    <nav className="flex-1 space-y-1 p-4">
      {nav.map((item) => (
        <NavItem key={item.to} {...item} onNavigate={onNavigate} />
      ))}
    </nav>
    <div className="p-4 border-t border-border/60">
      <NavLink
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
      >
        <Home className="w-5 h-5" />
        <span>العودة للموقع</span>
      </NavLink>
    </div>
  );
};

const StudentLayout = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (profile?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  if (profile?.role === "parent") {
    return <Navigate to="/parent" replace />;
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "ط";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex w-full" dir="rtl">
      <aside className="hidden lg:block w-72 shrink-0 border-l border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="sticky top-0 h-screen">
          <SidebarInner />
        </div>
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 w-72 bg-card border-l border-border shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-end p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <SidebarInner onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              أهلًا بك،{" "}
              <span className="text-foreground font-semibold">
                {profile?.full_name || "طالب"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <WalletWidget to="/dashboard/wallet" />
            <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-full p-1 pl-3 hover:bg-accent transition-colors">
                <span className="hidden md:inline text-sm font-medium">
                  {profile?.full_name || user?.email}
                </span>
                <Avatar className="w-9 h-9 border border-border">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{profile?.full_name || "طالب"}</div>
                <div className="text-xs text-muted-foreground font-normal truncate">
                  {user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/dashboard/account")}>
                <UserCircle2 className="w-4 h-4 ml-2" />
                حسابي
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="w-4 h-4 ml-2" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 p-4 md:p-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
};

export default StudentLayout;
