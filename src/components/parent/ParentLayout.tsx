import { useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home, LogOut, Menu, Users, LinkIcon, UserCircle2, X, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

const nav = [
  { to: "/parent", label: "أبنائي", icon: Users, end: true },
  { to: "/parent/link", label: "ربط طالب جديد", icon: LinkIcon },
  { to: "/parent/notifications", label: "الإشعارات", icon: Bell },
  { to: "/parent/account", label: "حسابي", icon: UserCircle2 },
];

const SidebarInner = ({ onNavigate }: { onNavigate?: () => void }) => (
  <div className="flex h-full flex-col">
    <div className="px-6 py-6 border-b border-border/60">
      <NavLink to="/" className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
          س
        </div>
        <div>
          <div className="font-bold leading-tight">لوحة ولي الأمر</div>
          <div className="text-xs text-muted-foreground">متابعة أبنائك</div>
        </div>
      </NavLink>
    </div>
    <nav className="flex-1 space-y-1 p-4">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent"
            }`
          }
        >
          <item.icon className="w-5 h-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
    <div className="p-4 border-t border-border/60">
      <NavLink to="/" onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-foreground/70 hover:bg-accent">
        <Home className="w-5 h-5" /> العودة للموقع
      </NavLink>
    </div>
  </div>
);

const ParentLayout = () => {
  const { user, profile, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  if (profile?.role === "student") return <Navigate to="/dashboard" replace />;

  const initials = profile?.full_name?.[0] || user.email?.[0] || "و";

  return (
    <div className="min-h-screen bg-background flex w-full" dir="rtl">
      <aside className="hidden lg:block w-72 shrink-0 border-l border-border/60 bg-card/50">
        <div className="sticky top-0 h-screen"><SidebarInner /></div>
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden" />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 w-72 bg-card border-l shadow-2xl lg:hidden">
              <div className="flex justify-end p-2">
                <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <SidebarInner onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              أهلاً، <span className="text-foreground font-semibold">{profile?.full_name || "ولي أمر"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
              <LogOut className="w-4 h-4 ml-1" /> خروج
            </Button>
            <Avatar className="w-9 h-9 border">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ParentLayout;
