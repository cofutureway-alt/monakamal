import { Link } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { usePublicBundles } from "@/hooks/use-public-bundles";
import { BundleCard } from "@/components/BundleCard";

const BundlesSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const bundles = usePublicBundles(6);

  if (bundles === null) return null;
  if (bundles.length === 0) return null;

  return (
    <section id="bundles" className="py-24 px-6 relative overflow-hidden bg-secondary/30">
      <EightPointStar size={70} className="absolute top-12 left-12 text-primary/5 animate-spin-slow pointer-events-none" />
      <EightPointStar size={50} className="absolute bottom-12 right-12 text-primary/5 animate-float pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-xs uppercase tracking-widest border border-accent/20">
            <Package className="w-4 h-4 text-accent" />
            <span>عروض باقات الدورات</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-primary tracking-tight">
            باقات الدورات التوفيرية
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            احصل على مجموعة متكاملة من الدورات التدريبية في باقة واحدة بسعر توفيري متميز
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {bundles.map((b, i) => (
            <BundleCard key={b.id} bundle={b} index={i} />
          ))}
        </div>

        <div className="text-center mt-14">
          <Button asChild size="lg" variant="outline" className="gap-2 font-bold text-base px-8 py-6 rounded-2xl border-primary/20 text-primary hover:bg-primary hover:text-white transition-all">
            <Link to="/bundles">
              عرض جميع الباقات
              <ArrowLeft size={18} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default BundlesSection;
