import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  ClipboardEdit,
  CreditCard,
  GraduationCap,
  Landmark,
  Receipt,
  Inbox,
  Layers,
  LogOut,
  Menu,
  X,
  PanelRightClose,
  PanelRightOpen,
  Home,
  Settings2,
  User as UserIcon,
  UserCog,
  Users,
  Wallet as WalletIcon,
  Ticket,
  Bell,
  MessageSquare,
  Sliders,
  FileText,
  BadgeDollarSign,
  Package,
  Trophy,
  Coins,
  Truck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
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
import NotificationBell from "@/components/notifications/NotificationBell";
import { supabase } from "@/integrations/supabase/client";

type LeafItem = { to: string; label: string; icon: typeof BarChart3; end?: boolean };
type GroupItem = { id: string; label: string; icon: typeof BarChart3; children: LeafItem[] };
type NavEntry = LeafItem | GroupItem;

const isGroup = (e: NavEntry): e is GroupItem => (e as GroupItem).children !== undefined;

const nav: NavEntry[] = [
  { to: "/admin", label: "الإحصائيات", icon: BarChart3, end: true },
  {
    id: "academics",
    label: "المحتوى التعليمي",
    icon: GraduationCap,
    children: [
      { to: "/admin/courses", label: "الدورات", icon: BookOpen },
      { to: "/admin/bundles", label: "الباقات", icon: Package },
      { to: "/admin/books", label: "إدارة الكتب", icon: BookMarked },
      { to: "/admin/shipping-zones", label: "مناطق الشحن", icon: Truck },
      { to: "/admin/branches", label: "أماكن التواجد (أماكن الشرح)", icon: Landmark },
      { to: "/admin/stages", label: "المراحل", icon: Layers },
      { to: "/admin/subjects", label: "المواد الدراسية", icon: BookMarked },
    ],
  },
  {
    id: "students",
    label: "الطلاب والتقييم",
    icon: Users,
    children: [
      { to: "/admin/users",               label: "جميع المستخدمين",    icon: UserCog },
      { to: "/admin/students",            label: "إدارة الطلاب",        icon: Users },
      { to: "/admin/testimonials",        label: "آراء الطلاب",         icon: MessageSquare },
      { to: "/admin/parents",             label: "أولياء الأمور",       icon: Users },
      { to: "/admin/parent-link-requests",label: "طلبات أولياء الأمور", icon: Users },
      { to: "/admin/quiz-attempts",       label: "محاولات الاختبارات",  icon: ClipboardCheck },
      { to: "/admin/assignment-submissions",label: "تسليمات الواجبات",   icon: ClipboardEdit },
      { to: "/admin/cards",               label: "كروت الطلاب",         icon: CreditCard },
    ],
  },
  {
    id: "finance",
    label: "المالية",
    icon: BadgeDollarSign,
    children: [
      { to: "/admin/purchase-codes", label: "إدارة أكواد الشراء", icon: Ticket },
      { to: "/admin/wallets", label: "المحافظ والكروت", icon: WalletIcon },
      { to: "/admin/payment-gateways", label: "بوابات الدفع", icon: Landmark },
      { to: "/admin/payment-requests", label: "طلبات الدفع", icon: Inbox },
      { to: "/admin/book-orders", label: "طلبات الكتب", icon: Package },
      { to: "/admin/refund-requests", label: "طلبات الاسترجاع", icon: Inbox },
      { to: "/admin/billing", label: "الفوترة والمدفوعات", icon: Receipt },
    ],
  },
  {
    id: "leaderboard",
    label: "لوحة المتصدرين",
    icon: Trophy,
    children: [
      { to: "/admin/leaderboard", label: "الأوائل", icon: Trophy, end: true },
      { to: "/admin/leaderboard/badges", label: "الشارات", icon: BookMarked },
      { to: "/admin/leaderboard/levels", label: "المستويات", icon: Layers },
      { to: "/admin/leaderboard/settings", label: "الإعدادات", icon: Settings2 },
    ],
  },
  { to: "/admin/notifications", label: "الإشعارات", icon: Bell },
  {
    id: "whatsapp",
    label: "واتساب (Rasvio)",
    icon: MessageSquare,
    children: [
      { to: "/admin/settings/whatsapp", label: "إعدادات واتساب", icon: Sliders },
      { to: "/admin/whatsapp-log", label: "سجل الرسائل", icon: FileText },
    ],
  },
  { to: "/admin/settings", label: "الإعدادات", icon: Settings2 },
  { to: "/admin/account", label: "الملف الشخصي", icon: UserIcon },
];

const NavLeaf = ({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
  collapsed,
  nested,
}: LeafItem & { onNavigate?: () => void; collapsed?: boolean; nested?: boolean }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onNavigate}
    title={collapsed ? label : undefined}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-xl ${collapsed ? "justify-center px-2" : nested ? "pr-8 pl-3" : "px-4"} py-2.5 text-sm font-medium transition-all ${
        isActive
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "text-foreground/70 hover:bg-accent hover:text-foreground"
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <motion.span
            layoutId="admin-nav-active"
            className="absolute inset-0 rounded-xl bg-primary -z-10"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </>
    )}
  </NavLink>
);

const NavGroup = ({
  group,
  collapsed,
  onNavigate,
  openId,
  setOpenId,
  pathname,
}: {
  group: GroupItem;
  collapsed?: boolean;
  onNavigate?: () => void;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  pathname: string;
}) => {
  const hasActive = group.children.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));
  const isOpen = openId === group.id || (!openId && hasActive);
  const [hover, setHover] = useState(false);
  const Icon = group.icon;

  // Collapsed sidebar → flyout on hover
  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button
          type="button"
          title={group.label}
          className={`w-full flex items-center justify-center px-2 py-3 rounded-xl text-sm font-medium transition-all ${
            hasActive
              ? "bg-primary/10 text-primary"
              : "text-foreground/70 hover:bg-accent hover:text-foreground"
          }`}
        >
          <Icon className="w-5 h-5" />
        </button>
        <AnimatePresence>
          {hover && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-0 right-full mr-2 z-50 w-56 rounded-xl border border-border/60 bg-popover shadow-2xl p-2"
            >
              <div className="px-2 py-1 text-xs font-bold text-muted-foreground">{group.label}</div>
              <div className="space-y-1 mt-1">
                {group.children.map((c) => (
                  <NavLeaf key={c.to} {...c} onNavigate={onNavigate} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenId(isOpen ? null : group.id)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
          hasActive
            ? "bg-primary/10 text-primary"
            : "text-foreground/70 hover:bg-accent hover:text-foreground"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-right truncate">{group.label}</span>
        <motion.span animate={{ rotate: isOpen ? -90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronLeft className="w-4 h-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mt-1 space-y-1">
              <span className="absolute right-6 top-1 bottom-1 w-px bg-border/70" />
              {group.children.map((c) => (
                <NavLeaf key={c.to} {...c} onNavigate={onNavigate} nested />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SidebarContent = ({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) => {
  const { pathname } = useLocation();
  const defaultOpen = useMemo(() => {
    const g = nav.find(
      (e) =>
        isGroup(e) &&
        e.children.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"))
    );
    return g && isGroup(g) ? g.id : null;
  }, [pathname]);
  const [openId, setOpenId] = useState<string | null>(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpenId(defaultOpen);
  }, [defaultOpen]);

  const { theme } = useTheme();
  const { settings } = usePlatformSettings();
  const logoUrl =
    theme === "dark"
      ? (settings.logo_dark_url || "/logo-dark.png")
      : (settings.logo_light_url || "/logo-light.png");

  return (
    <div className="flex h-full flex-col">
      <div className={`${collapsed ? "px-3" : "px-6"} py-6 border-b border-border/60`}>
        <NavLink to="/" className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} group`}>
          <img src={logoUrl} alt="منصة الأستاذة منى كامل" className="h-10 sm:h-12 w-auto max-h-12 object-contain" />
          {!collapsed && (
            <div>
              <div className="font-bold text-foreground leading-tight">لوحة الإدارة</div>
              <div className="text-xs text-muted-foreground">إدارة المنصة</div>
            </div>
          )}
        </NavLink>
      </div>

      <nav className={`flex-1 space-y-1 ${collapsed ? "p-2" : "p-4"} overflow-y-auto`}>
        {nav.map((item) =>
          isGroup(item) ? (
            <NavGroup
              key={item.id}
              group={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              openId={openId}
              setOpenId={setOpenId}
              pathname={pathname}
            />
          ) : (
            <NavLeaf key={item.to} {...item} onNavigate={onNavigate} collapsed={collapsed} />
          )
        )}
      </nav>

      <div className={`${collapsed ? "p-2" : "p-4"} border-t border-border/60`}>
        <NavLink
          to="/"
          onClick={onNavigate}
          title={collapsed ? "العودة للموقع" : undefined}
          className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 rounded-xl text-sm text-foreground/70 hover:bg-accent hover:text-foreground transition-colors`}
        >
          <Home className="w-5 h-5" />
          {!collapsed && <span>العودة للموقع</span>}
        </NavLink>
      </div>
    </div>
  );
};

const AdminLayout = ({ children }: { children?: ReactNode }) => {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin-sidebar-collapsed") === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem("admin-sidebar-collapsed", nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  const initials =
    profile?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "A";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex w-full" dir="rtl">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block ${collapsed ? "w-20" : "w-72"} shrink-0 border-l border-border/60 bg-card/50 backdrop-blur-sm transition-[width] duration-300`}>
        <div className="sticky top-0 h-screen">
          <SidebarContent collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
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
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
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
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={toggleCollapsed}
              title={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
            >
              {collapsed ? <PanelRightOpen className="w-5 h-5" /> : <PanelRightClose className="w-5 h-5" />}
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              مرحبًا بعودتك،{" "}
              <span className="text-foreground font-semibold">
                {profile?.full_name || "المشرف"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <WalletWidget to="/admin/wallets" />
            <ThemeToggle />
            <NotificationBell />
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
                <div className="font-semibold">{profile?.full_name || "مشرف"}</div>
                <div className="text-xs text-muted-foreground font-normal truncate">
                  {user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/admin/account")}>
                <UserIcon className="w-4 h-4 ml-2" />
                الملف الشخصي
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
          {children ?? <Outlet />}
        </motion.main>
      </div>
    </div>
  );
};

export default AdminLayout;
