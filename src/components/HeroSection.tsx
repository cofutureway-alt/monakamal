import { useRef } from "react";
import type { Variants } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EightPointStar } from "@/components/IslamicPatterns";
import instructorHero from "@/assets/instructor-hero.jpg.asset.json";
import { usePlatformSettings, DEFAULT_PLATFORM_SETTINGS } from "@/hooks/use-platform-settings";

const HeroSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const { settings } = usePlatformSettings();

  // ── Resolve content — fall back to hardcoded defaults if DB value is absent ──
  const heroImageUrl = settings.hero_image_url ?? instructorHero.url;
  const rawHeadline = settings.hero_headline ?? DEFAULT_PLATFORM_SETTINGS.hero_headline ?? "";
  const heroSubtext = settings.hero_subtext ?? DEFAULT_PLATFORM_SETTINGS.hero_subtext ?? "";
  const ctaLabel = settings.hero_cta_label ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_label ?? "";
  const ctaUrl = settings.hero_cta_url ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_url ?? "/courses";

  // Split headline into up to two lines (first line normal, second line in primary color)
  const [headlineLine1 = "", headlineLine2 = ""] = rawHeadline.split("\n");

  // ── Scroll-driven parallax (unchanged from original) ─────────────────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", prefersReduced ? "0%" : "12%"]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, prefersReduced ? 1 : 1.05]);

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: prefersReduced ? 0 : 0.12, delayChildren: 0.05 },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: prefersReduced ? 0 : 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative pt-12 pb-24 px-4 sm:px-6 overflow-hidden bg-background"
    >
      {/* Decorative ambient background glows */}
      <div className="absolute -top-10 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <EightPointStar
        size={44}
        className="absolute top-20 left-[5%] text-accent/20 hidden md:block animate-spin-slow"
      />
      <EightPointStar
        size={28}
        className="absolute bottom-16 right-[6%] text-primary/15 hidden md:block animate-float"
      />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text content — right side in RTL */}
          <motion.div
            className="relative z-10 order-2 lg:order-1 text-right"
            variants={container}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={item}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-sm mb-6 border border-accent/20 shadow-sm">
                <GraduationCap size={16} className="text-accent" />
                <span>معلم أول رياضيات - منصة الأستاذة منى كامل</span>
              </span>
            </motion.div>

            <motion.h1
              variants={item}
              className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-primary leading-tight"
            >
              {headlineLine1}
              {headlineLine2 && (
                <>
                  <br />
                  <span className="text-foreground">{headlineLine2}</span>
                </>
              )}
            </motion.h1>

            <motion.p
              variants={item}
              className="text-lg md:text-2xl text-muted-foreground mt-6 leading-relaxed max-w-2xl"
            >
              {heroSubtext}
            </motion.p>

            <motion.div
              variants={item}
              className="mt-10 flex flex-wrap items-center gap-4 justify-start"
            >
              <Button asChild size="lg" className="bg-primary text-primary-foreground px-10 py-6 rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-primary/20 transition-all gap-3">
                <Link to={ctaUrl}>
                  {ctaLabel}
                  <ArrowLeft size={20} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-2 border-primary/20 text-primary px-8 py-6 rounded-2xl font-bold text-lg hover:bg-primary/5 transition-colors">
                <Link to="/signup">إنشاء حساب</Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Instructor / hero image */}
          <div className="relative order-1 lg:order-2 flex justify-center lg:justify-end">
            <motion.div
              className="relative w-full max-w-[480px] aspect-square rounded-[2rem] overflow-hidden shadow-2xl shadow-primary/10 border border-border/60 bg-card"
              initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
              style={{ y: imageY, scale: imageScale }}
            >
              <img
                src={heroImageUrl}
                alt="منصة الأستاذة منى كامل - الرياضيات"
                className="w-full h-full object-cover"
                loading="eager"
                {...({ fetchpriority: "high" } as any)}
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-[2rem]"></div>
            </motion.div>

            {/* Decorative background glow rings */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-accent/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
