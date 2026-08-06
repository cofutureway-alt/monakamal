import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { EightPointStar, CrescentStar, IslamicDivider } from "@/components/IslamicPatterns";
import ThemeToggle from "@/components/ThemeToggle";

import { useTheme } from "@/contexts/ThemeContext";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

const AuthLayout = ({ title, subtitle, children, footer }: Props) => {
  const { theme } = useTheme();
  const { settings } = usePlatformSettings();
  const logoUrl =
    theme === "dark"
      ? (settings.logo_dark_url || "/logo-dark.png")
      : (settings.logo_light_url || "/logo-light.png");

  return (
    <div className="min-h-screen relative overflow-hidden bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-20">
        <ThemeToggle />
      </div>
      {/* Geometric background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80' fill='none'%3E%3Cg stroke='%23000' stroke-width='0.5'%3E%3Cpolygon points='40,10 55,17 60,33 55,48 40,55 25,48 20,33 25,17'/%3E%3Cline x1='40' y1='0' x2='40' y2='10'/%3E%3Cline x1='40' y1='55' x2='40' y2='80'/%3E%3Cline x1='0' y1='33' x2='20' y2='33'/%3E%3Cline x1='60' y1='33' x2='80' y2='33'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />

      {/* Floating ornaments */}
      <EightPointStar size={70} className="absolute top-16 right-[8%] text-primary/8 animate-float pointer-events-none" />
      <EightPointStar size={40} className="absolute bottom-24 left-[10%] text-primary/6 animate-bounce-soft pointer-events-none" />
      <CrescentStar size={50} className="absolute top-24 left-[8%] text-primary/8 animate-float pointer-events-none" style={{ animationDelay: "1.5s" }} />
      <EightPointStar size={30} className="absolute bottom-16 right-[12%] text-primary/6 animate-pulse-soft pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md z-10"
      >
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="flex justify-center mb-6"
          >
            <Link to="/">
              <img src={logoUrl} alt="منصة الأستاذة منى كامل" className="h-16 w-auto max-h-20 object-contain" />
            </Link>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="text-2xl md:text-3xl font-extrabold text-center text-foreground mb-2"
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-sm text-muted-foreground text-center mb-6"
          >
            {subtitle}
          </motion.p>

          <IslamicDivider className="mb-6" />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            {children}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            {footer}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthLayout;
