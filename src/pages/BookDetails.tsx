import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Cloud,
  Package,
  ArrowRight,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Building2,
  User,
  Calendar,
  Globe,
  Tag,
  Truck,
  Sparkles,
  Info,
  ChevronRight,
  BookMarked,
  FileText,
  Weight,
  Maximize2,
  Barcode,
  Layers,
  GraduationCap,
  Download,
  Lock,
  Box,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ZoomIn,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPiastres, getEffectivePrice } from "@/lib/money";
import { useSignedUrl } from "@/hooks/use-signed-url";
import AddToCartButton from "@/components/AddToCartButton";
import DiscountCountdown from "@/components/DiscountCountdown";

interface BookImage {
  id: string;
  image_url: string;
  order_index: number;
}

interface DetailedBook {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publication_year: number | null;
  isbn: string | null;
  language: string | null;
  description: string | null;
  cover_image_url: string | null;
  book_type: "digital" | "physical";
  price_piastres: number;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
  stock_quantity: number | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  download_limit: number | null;
  unlimited_downloads: boolean | null;
  is_drm_protected: boolean | null;
  tags: string[] | null;
  subject_id: string | null;
  stage_id: string | null;
  subjects?: { name: string } | null;
  stages?: { name: string } | null;
  book_images?: BookImage[] | null;
}

function ImageDisplay({ path, alt, onClick }: { path: string | null; alt: string; onClick?: () => void }) {
  const url = useSignedUrl("book-assets", path);
  if (!url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-accent/50 text-muted-foreground p-6 text-center">
        <BookOpen className="w-20 h-20 opacity-30 mb-3" />
        <span className="text-sm font-medium">لا توجد صورة لغلاف الكتاب</span>
      </div>
    );
  }
  return (
    <div className="relative w-full h-full group cursor-pointer" onClick={onClick}>
      <img
        src={url}
        alt={alt}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 font-medium text-xs">
        <ZoomIn className="w-5 h-5" /> اضغط لتكبير الصورة
      </div>
    </div>
  );
}

function GalleryThumbnail({
  path,
  alt,
  active,
  onClick,
}: {
  path: string;
  alt: string;
  active: boolean;
  onClick: () => void;
}) {
  const url = useSignedUrl("book-assets", path);
  return (
    <button
      onClick={onClick}
      type="button"
      className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square w-16 h-16 shrink-0 ${
        active ? "border-primary shadow-md scale-105" : "border-border/60 opacity-70 hover:opacity-100"
      }`}
    >
      {url ? (
        <img src={url} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-accent flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </button>
  );
}

function SampleImageCard({
  path,
  title,
  onOpenLightbox,
}: {
  path: string;
  title: string;
  onOpenLightbox: () => void;
}) {
  const url = useSignedUrl("book-assets", path);
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onOpenLightbox}
      className="group relative aspect-[4/3] sm:aspect-[3/4] rounded-xl overflow-hidden bg-card border border-border/80 shadow-sm cursor-pointer hover:shadow-xl transition-all"
    >
      {url ? (
        <img
          src={url}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full bg-accent flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-3 text-center text-white gap-2 backdrop-blur-[2px]">
        <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center text-white shadow-lg transform group-hover:scale-110 transition-transform">
          <Maximize2 className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold">{title}</span>
        <span className="text-[11px] text-white/80">انقر للمعاينة والتكبير</span>
      </div>
    </motion.div>
  );
}

function LightboxModal({
  images,
  currentIndex,
  onClose,
  onSelectIndex,
}: {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onSelectIndex: (idx: number) => void;
}) {
  const currentPath = images[currentIndex];
  const url = useSignedUrl("book-assets", currentPath);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") {
        onSelectIndex((currentIndex + 1) % images.length);
      }
      if (e.key === "ArrowRight") {
        onSelectIndex((currentIndex - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, onClose, onSelectIndex]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 dir-rtl select-none">
      {/* Top Header Bar */}
      <div className="w-full flex items-center justify-between text-white z-10 max-w-6xl">
        <span className="text-xs sm:text-sm font-medium bg-white/10 px-3.5 py-1.5 rounded-full border border-white/20">
          صورة {currentIndex + 1} من {images.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-full w-10 h-10"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Main Image Container */}
      <div className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-4 overflow-hidden">
        {images.length > 1 && (
          <>
            <button
              onClick={() => onSelectIndex((currentIndex - 1 + images.length) % images.length)}
              className="absolute right-2 sm:right-6 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full border border-white/20 backdrop-blur-sm transition-all hover:scale-110"
              title="الصورة السابقة"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            <button
              onClick={() => onSelectIndex((currentIndex + 1) % images.length)}
              className="absolute left-2 sm:left-6 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full border border-white/20 backdrop-blur-sm transition-all hover:scale-110"
              title="الصورة التالية"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          </>
        )}

        {url ? (
          <img
            src={url}
            alt={`Book Image ${currentIndex + 1}`}
            className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl transition-all duration-300"
          />
        ) : (
          <Loader2 className="w-10 h-10 animate-spin text-white opacity-60" />
        )}
      </div>

      {/* Bottom Thumbnails Strip */}
      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto p-2 bg-white/10 rounded-2xl border border-white/20 max-w-xl w-full justify-center backdrop-blur-md">
          {images.map((img, idx) => (
            <LightboxThumbnail
              key={idx}
              path={img}
              active={idx === currentIndex}
              onClick={() => onSelectIndex(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LightboxThumbnail({
  path,
  active,
  onClick,
}: {
  path: string;
  active: boolean;
  onClick: () => void;
}) {
  const url = useSignedUrl("book-assets", path);
  return (
    <button
      onClick={onClick}
      className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
        active ? "border-primary scale-110 shadow-lg" : "border-white/30 opacity-50 hover:opacity-100"
      }`}
    >
      {url && <img src={url} alt="thumb" className="w-full h-full object-cover" />}
    </button>
  );
}

function RelatedBookCard({ book }: { book: DetailedBook }) {
  const eff = getEffectivePrice(book.price_piastres, book.discount_price_piastres, book.discount_expires_at);
  const coverUrl = useSignedUrl("book-assets", book.cover_image_url);

  return (
    <Card className="overflow-hidden h-full flex flex-col hover:shadow-lg transition-all border-border/60 group">
      <Link to={`/books/${book.id}`} className="block relative aspect-[3/4] bg-accent overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <BookOpen className="w-10 h-10" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          {book.book_type === "digital" ? (
            <Badge variant="secondary" className="gap-1 bg-background/80 backdrop-blur-md">
              <Cloud className="w-3 h-3" /> رقمي
            </Badge>
          ) : (
            <Badge className="gap-1 bg-background/80 backdrop-blur-md text-foreground">
              <Package className="w-3 h-3 text-primary" /> مطبوع
            </Badge>
          )}
        </div>
      </Link>
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <Link to={`/books/${book.id}`} className="hover:text-primary transition-colors">
            <h4 className="font-bold line-clamp-1 text-sm">{book.title}</h4>
          </Link>
          {book.author && <p className="text-xs text-muted-foreground mt-0.5">{book.author}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-sm text-primary">{formatPiastres(eff.amount)}</span>
            {eff.discountActive && (
              <span className="text-[10px] text-muted-foreground line-through">
                {formatPiastres(eff.originalAmount ?? 0)}
              </span>
            )}
          </div>
          <AddToCartButton bookId={book.id} bookType={book.book_type} stockQuantity={book.stock_quantity} size="sm" />
        </div>
      </div>
    </Card>
  );
}

export default function BookDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<DetailedBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [relatedBooks, setRelatedBooks] = useState<DetailedBook[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadBook = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("books")
      .select(
        "*, subjects(name), stages(name), book_images(id, image_url, order_index)"
      )
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) {
      setBook(null);
      setLoading(false);
      return;
    }

    const b = data as DetailedBook;
    setBook(b);
    setSelectedImage(b.cover_image_url);
    document.title = `${b.title} — منصة الأستاذة منى كامل`;

    // Fetch related books from same subject or stage
    let query = (supabase as any)
      .from("books")
      .select("id, title, author, cover_image_url, book_type, price_piastres, discount_price_piastres, discount_expires_at, stock_quantity")
      .eq("status", "published")
      .neq("id", b.id)
      .limit(4);

    if (b.subject_id) {
      query = query.eq("subject_id", b.subject_id);
    } else if (b.stage_id) {
      query = query.eq("stage_id", b.stage_id);
    }

    const { data: rel } = await query;
    setRelatedBooks((rel as DetailedBook[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 pt-28 pb-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium">جاري تحميل تفاصيل الكتاب…</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 pt-28 pb-16 flex items-center justify-center">
          <Card className="p-8 md:p-12 text-center max-w-md w-full shadow-lg border-border/60">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-xl font-bold mb-2">الكتاب غير موجود</h2>
            <p className="text-sm text-muted-foreground mb-6">
              عذراً، لم نتمكن من العثور على هذا الكتاب أو قد يكون غير متاح حالياً.
            </p>
            <Button onClick={() => navigate("/books")} className="gap-2">
              <ArrowRight className="w-4 h-4" /> العودة لمكتبة الكتب
            </Button>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const effPrice = getEffectivePrice(
    book.price_piastres,
    book.discount_price_piastres,
    book.discount_expires_at
  );

  const imagesList: string[] = [];
  if (book.cover_image_url) imagesList.push(book.cover_image_url);
  if (book.book_images && book.book_images.length > 0) {
    const sorted = [...book.book_images].sort((a, b) => a.order_index - b.order_index);
    sorted.forEach((img) => {
      if (img.image_url !== book.cover_image_url) {
        imagesList.push(img.image_url);
      }
    });
  }

  const isPhysical = book.book_type === "physical";
  const inStock = isPhysical ? (book.stock_quantity ?? 0) > 0 : true;

  const currentSelectedIdx = imagesList.indexOf(selectedImage || book.cover_image_url || "");

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      {/* Lightbox Modal */}
      {lightboxIndex !== null && imagesList.length > 0 && (
        <LightboxModal
          images={imagesList}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSelectIndex={(idx) => setLightboxIndex(idx)}
        />
      )}

      <main className="flex-1 container mx-auto px-4 pt-24 pb-16">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6 overflow-x-auto pb-1">
          <Link to="/" className="hover:text-foreground transition-colors">
            الرئيسية
          </Link>
          <ChevronRight className="w-3.5 h-3.5 rotate-180 text-muted-foreground/60 shrink-0" />
          <Link to="/books" className="hover:text-foreground transition-colors">
            الكتب والمراجع
          </Link>
          <ChevronRight className="w-3.5 h-3.5 rotate-180 text-muted-foreground/60 shrink-0" />
          <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-xs">
            {book.title}
          </span>
        </nav>

        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/books")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="w-4 h-4" /> العودة لجميع الكتب
          </Button>
        </div>

        {/* Main Product Header & Pricing Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          {/* Left Column: Cover Image & Gallery (lg: 5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-card border border-border/80 shadow-xl group"
            >
              <ImageDisplay
                path={selectedImage}
                alt={book.title}
                onClick={() => setLightboxIndex(currentSelectedIdx >= 0 ? currentSelectedIdx : 0)}
              />

              {/* Floating Badges */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                {isPhysical ? (
                  <Badge className="gap-1.5 px-3 py-1 bg-primary text-primary-foreground shadow-md text-xs font-semibold">
                    <Package className="w-3.5 h-3.5" /> كتاب مطبوع
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1.5 px-3 py-1 shadow-md text-xs font-semibold backdrop-blur-md bg-background/90">
                    <Cloud className="w-3.5 h-3.5 text-primary" /> كتاب رقمي (PDF)
                  </Badge>
                )}
                {effPrice.discountActive && (
                  <Badge variant="destructive" className="gap-1 px-3 py-1 shadow-md text-xs font-bold animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" /> خصم مميز
                  </Badge>
                )}
              </div>

              {/* Stock Status Badge */}
              {isPhysical && (
                <div className="absolute bottom-4 right-4 z-10">
                  {inStock ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 backdrop-blur-md gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> متوفر بالمخزون ({book.stock_quantity} نسخة)
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      نفدت الكمية بالمخزون
                    </Badge>
                  )}
                </div>
              )}
            </motion.div>

            {/* Additional Images Thumbnails */}
            {imagesList.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto py-2">
                {imagesList.map((img, idx) => (
                  <GalleryThumbnail
                    key={idx}
                    path={img}
                    alt={`${book.title} - ${idx + 1}`}
                    active={selectedImage === img}
                    onClick={() => {
                      setSelectedImage(img);
                      setLightboxIndex(idx);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Title, Quick Meta, Price & Cart Action (lg: 7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Category Badges */}
              <div className="flex flex-wrap gap-2 items-center">
                {book.stages?.name && (
                  <Badge variant="outline" className="gap-1 text-xs px-2.5 py-1">
                    <GraduationCap className="w-3.5 h-3.5 text-primary" />
                    {book.stages.name}
                  </Badge>
                )}
                {book.subjects?.name && (
                  <Badge variant="secondary" className="gap-1 text-xs px-2.5 py-1">
                    <BookMarked className="w-3.5 h-3.5" />
                    {book.subjects.name}
                  </Badge>
                )}
              </div>

              {/* Title & Author */}
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight text-foreground">
                  {book.title}
                </h1>
                {book.author && (
                  <div className="flex items-center gap-2 mt-2.5 text-sm md:text-base text-muted-foreground font-medium">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <span>المؤلف: <strong className="text-foreground">{book.author}</strong></span>
                  </div>
                )}
              </div>

              {/* Price & Discount Card */}
              <Card className="p-5 border-primary/20 bg-primary/5 dark:bg-primary/10 rounded-xl space-y-3 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-0.5">السعر الحالي</span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl md:text-4xl font-extrabold text-primary">
                        {formatPiastres(effPrice.amount)}
                      </span>
                      {effPrice.discountActive && (
                        <span className="text-lg text-muted-foreground line-through font-medium">
                          {formatPiastres(effPrice.originalAmount ?? 0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {effPrice.discountActive && book.discount_expires_at && (
                    <div className="bg-background/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-border/60">
                      <span className="text-[11px] text-muted-foreground block mb-1">ينتهي الخصم خلال</span>
                      <DiscountCountdown target={new Date(book.discount_expires_at)} compact />
                    </div>
                  )}
                </div>
              </Card>

              {/* Tags Section */}
              {book.tags && book.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center pt-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 ml-1">
                    <Tag className="w-3.5 h-3.5 text-primary" /> الوسوم:
                  </span>
                  {book.tags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-accent/40 font-normal">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Primary Action Button (Add to Cart -> View Cart) */}
              <div className="pt-3 space-y-3">
                <AddToCartButton
                  bookId={book.id}
                  bookType={book.book_type}
                  stockQuantity={book.stock_quantity}
                  size="lg"
                  fullWidth
                  className="h-12 text-base font-bold shadow-md hover:shadow-lg transition-all"
                />

                {/* Feature Guarantee Badges */}
                <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground pt-2 border-t border-border/40">
                  {isPhysical ? (
                    <>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Truck className="w-4 h-4 text-primary" /> شحن سريع لكافة المحافظات
                      </span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="w-4 h-4 text-primary" /> تغليف متين وحماية كاملة
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Cloud className="w-4 h-4 text-primary" /> وصول فوري ومباشر بعد الشراء
                      </span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Lock className="w-4 h-4 text-primary" /> حماية المحتوى والملكية DRM
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated "صور وتفاصيل من داخل الكتاب" Gallery Section */}
        {imagesList.length > 0 && (
          <div className="mb-10 space-y-4">
            <Card className="p-6 border-border/60 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-bold text-foreground">
                      صور وتفاصيل من داخل الكتاب
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      عاين صفحات الكتاب وتفاصيله الداخلية قبل الشراء (انقر على أي صورة لتكبيرها)
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {imagesList.length} صور ومعاينات
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {imagesList.map((img, idx) => (
                  <SampleImageCard
                    key={idx}
                    path={img}
                    title={idx === 0 ? "صورة الغلاف" : `معاينة داخلية ${idx}`}
                    onOpenLightbox={() => setLightboxIndex(idx)}
                  />
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Full Description & Overview Section */}
        {book.description && (
          <div className="mb-10">
            <Card className="p-6 md:p-8 border-border/60 shadow-sm space-y-4">
              <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
                <FileText className="w-5 h-5 text-primary" /> الوصف والتفاصيل العامة
              </h2>
              <div className="text-sm md:text-base text-foreground/90 leading-relaxed whitespace-pre-line font-normal">
                {book.description}
              </div>
            </Card>
          </div>
        )}

        {/* Complete Book Specifications Table / Grid */}
        <div className="mb-12">
          <Card className="p-6 md:p-8 border-border/60 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" /> دليل ومواصفات الكتاب الكاملة
              </h2>
              <Badge variant="secondary" className="text-xs">
                {isPhysical ? "إصدار مطبوع" : "إصدار رقمي PDF"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {/* Title */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary" /> عنوان الكتاب
                </span>
                <p className="font-semibold text-foreground truncate">{book.title}</p>
              </div>

              {/* Author */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" /> المؤلف
                </span>
                <p className="font-semibold text-foreground">{book.author || "غير محدد"}</p>
              </div>

              {/* Publisher */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" /> دار النشر
                </span>
                <p className="font-semibold text-foreground">{book.publisher || "غير محدد"}</p>
              </div>

              {/* Stage */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-primary" /> المرحلة الدراسية
                </span>
                <p className="font-semibold text-foreground">{book.stages?.name || "عام"}</p>
              </div>

              {/* Subject */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BookMarked className="w-3.5 h-3.5 text-primary" /> المادة الدراسية
                </span>
                <p className="font-semibold text-foreground">{book.subjects?.name || "عام"}</p>
              </div>

              {/* Language */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" /> لغة الكتاب
                </span>
                <p className="font-semibold text-foreground">
                  {book.language === "ar" ? "العربية" : book.language === "en" ? "الإنجليزية" : book.language || "العربية"}
                </p>
              </div>

              {/* Publication Year */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> سنة النشر
                </span>
                <p className="font-semibold text-foreground">{book.publication_year || "غير محدد"}</p>
              </div>

              {/* ISBN */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-primary" /> رقم المعيار الدولي (ISBN)
                </span>
                <p className="font-mono font-semibold text-foreground">{book.isbn || "غير مسجل"}</p>
              </div>

              {/* Type */}
              <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" /> نوع النسخة
                </span>
                <p className="font-semibold text-foreground">
                  {isPhysical ? "نسخة ورقية مطبوعة" : "نسخة إلكترونية رقمية (PDF)"}
                </p>
              </div>

              {/* Specific physical specs */}
              {isPhysical && (
                <>
                  <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-primary" /> حالة المخزون
                    </span>
                    <p className="font-semibold text-foreground">
                      {inStock ? `${book.stock_quantity} نسخة متوفرة` : "نفدت الكمية"}
                    </p>
                  </div>

                  {book.weight_grams && (
                    <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Weight className="w-3.5 h-3.5 text-primary" /> وزن الكتاب
                      </span>
                      <p className="font-semibold text-foreground">{book.weight_grams} جرام</p>
                    </div>
                  )}

                  {(book.length_cm || book.width_cm || book.height_cm) && (
                    <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-primary" /> الأبعاد (طول × عرض × ارتفاع)
                      </span>
                      <p className="font-semibold text-foreground">
                        {book.length_cm ?? "-"} × {book.width_cm ?? "-"} × {book.height_cm ?? "-"} سم
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Specific digital specs */}
              {!isPhysical && (
                <>
                  <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-primary" /> حماية المحتوى (DRM)
                    </span>
                    <p className="font-semibold text-foreground">
                      {book.is_drm_protected !== false ? "مُفعلة وحصريّة للمنصة" : "غير مُفعلة"}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-accent/40 border border-border/40 space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-primary" /> حد التحميل المسموح
                    </span>
                    <p className="font-semibold text-foreground">
                      {book.unlimited_downloads ? "تحميلات غير محدودة" : `${book.download_limit ?? 3} مرات تحميل`}
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Related Books Section */}
        {relatedBooks.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl md:text-2xl font-bold">كتب قد تعجبك أيضاً</h2>
                <p className="text-xs md:text-sm text-muted-foreground">كتب أخرى متوفرة بنفس المرحلة أو المادة الدراسية</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/books")} className="gap-1 text-xs">
                عرض الكل <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {relatedBooks.map((b) => (
                <RelatedBookCard key={b.id} book={b} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
