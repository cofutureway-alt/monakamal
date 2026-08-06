import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, MessageSquareQuote, Eye, X } from "lucide-react";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { fetchPublicTestimonials, TestimonialRow } from "@/lib/testimonials-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<TestimonialRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await fetchPublicTestimonials();
        if (isMounted) setTestimonials(data);
      } catch (e) {
        if (isMounted) setTestimonials([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Autoplay functionality
  useEffect(() => {
    if (!testimonials || testimonials.length <= 1 || isPaused || selectedImage) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [testimonials, isPaused, selectedImage]);

  if (loading || !testimonials || testimonials.length === 0) {
    return null;
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section
      id="testimonials"
      className="py-24 px-6 relative overflow-hidden bg-background"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Ornaments */}
      <EightPointStar
        size={50}
        className="absolute top-12 right-10 text-primary/10 animate-spin-slow pointer-events-none hidden md:block"
      />
      <EightPointStar
        size={35}
        className="absolute bottom-12 left-10 text-accent/20 animate-spin-slow pointer-events-none hidden md:block"
        style={{ animationDirection: "reverse" }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 text-xs font-bold shadow-sm">
            <MessageSquareQuote size={14} />
            <span>آراء وتجارب الطلاب</span>
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-primary tracking-tight">
            آراء وانطباعات طلابنا
          </h2>

          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            اقرأ بعض تجارب وانطباعات الطلاب والطالبات الذين يتعلمون معنا على المنصة
          </p>
        </div>

        {/* Carousel Container */}
        <div className="relative max-w-6xl mx-auto">
          {/* Navigation Controls (Arrows) */}
          {testimonials.length > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                className="absolute right-0 md:-right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-xl hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all"
                title="السابق"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                className="absolute left-0 md:-left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-xl hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all"
                title="التالي"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            </>
          )}

          {/* Carousel Slider View */}
          <div className="overflow-hidden py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {/* Calculate visible indices for 3-items carousel */}
                {[0, 1, 2].map((offset) => {
                  const idx = (currentIndex + offset) % testimonials.length;
                  const item = testimonials[idx];
                  if (!item) return null;

                  return (
                    <Card
                      key={`${item.id}-${offset}`}
                      className={`group relative rounded-[2rem] border border-border/80 overflow-hidden bg-card hover:border-primary hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 cursor-pointer p-4 flex flex-col justify-between ${
                        offset >= 1 ? "hidden md:flex" : ""
                      } ${offset >= 2 ? "hidden lg:flex" : ""}`}
                      onClick={() => setSelectedImage(item.image_url)}
                    >
                      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted/40">
                        <img
                          src={item.image_url}
                          alt={item.student_name || `رأي طالب ${idx + 1}`}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-2 backdrop-blur-[2px]">
                          <Eye size={18} />
                          <span>اضغط لتكبير الصورة</span>
                        </div>
                      </div>

                      {item.student_name && (
                        <div className="mt-4 text-center text-base font-bold text-foreground truncate">
                          {item.student_name}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots Pagination */}
          {testimonials.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? "w-8 bg-primary shadow-sm"
                      : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                  aria-label={`انتقل للرأي ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 left-3 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => setSelectedImage(null)}
              >
                <X size={18} />
              </Button>
              <img
                src={selectedImage}
                alt="رأي الطالب"
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
