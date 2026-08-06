import { Link } from "react-router-dom";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import { useTheme } from "@/contexts/ThemeContext";
import { Globe } from "lucide-react";

// ── Social icon map (platform name → inline SVG path data) ───────
const SOCIAL_ICONS: Record<string, JSX.Element> = {
  youtube: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  ),
  facebook: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  instagram: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  ),
  twitter: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  ),
  telegram: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  ),
  whatsapp: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.72-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  tiktok: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  ),
  linkedin: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  snapchat: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
    </svg>
  ),
};

function getSocialIcon(platform: string): JSX.Element {
  const key = platform.toLowerCase().trim();
  return SOCIAL_ICONS[key] ?? <Globe className="w-5 h-5" />;
}

// ─────────────────────────────────────────────────────────────────

const Footer = () => {
  const { settings } = usePlatformSettings();
  const { theme } = useTheme();

  const logoUrl =
    theme === "dark"
      ? (settings.logo_dark_url || "/logo-dark.png")
      : (settings.logo_light_url || "/logo-light.png");

  // Use DB social links if any, otherwise fall back to hardcoded defaults so the
  // footer is never empty before the admin first configures things.
  const socialLinks =
    settings.social_links.length > 0
      ? settings.social_links
      : [
          { platform: "YouTube", url: "https://www.youtube.com" },
          { platform: "Facebook", url: "https://www.facebook.com" },
          { platform: "WhatsApp", url: "https://wa.me" },
          { platform: "Telegram", url: "https://t.me" },
        ];

  return (
    <footer className="py-12 px-6 border-t border-border/50 text-center bg-background relative overflow-hidden">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-right flex items-center gap-3">
          <img src={logoUrl} alt="منصة الأستاذة منى كامل" className="h-16 sm:h-20 w-auto max-h-20 object-contain" />
          <div>
            <h3 className="text-2xl font-bold text-primary mb-1">الأستاذة منى كامل</h3>
            <p className="text-sm text-muted-foreground">منصة تعليمية متكاملة لتدريس الرياضيات للمراحل الإعدادية والثانوية</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-8 text-sm font-medium">
          <Link to="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <Link to="/courses" className="hover:text-primary transition-colors">الدورات</Link>
          <Link to="/books" className="hover:text-primary transition-colors">الكتب</Link>
          <Link to="/branches" className="hover:text-primary transition-colors">أماكن التواجد</Link>
          <Link to="/leaderboard" className="hover:text-primary transition-colors">المتصدرين</Link>
        </div>

        <div className="flex items-center gap-3">
          {socialLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.platform}
              title={link.platform}
              className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
            >
              {getSocialIcon(link.platform)}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>جميع الحقوق محفوظة © {new Date().getFullYear()} منصة الأستاذة منى كامل - رياضيات</p>
        <a
          href="https://fakarli.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          title="فكرلي - Fakarli Studio"
        >
          <span>تم التطوير بواسطة</span>
          <img
            src={theme === "dark" ? "/fakarli-logo.png" : "/fakarli-logo-light.png"}
            alt="Fakarli"
            className="h-5 object-contain"
          />
        </a>
      </div>
    </footer>
  );
};

export default Footer;
