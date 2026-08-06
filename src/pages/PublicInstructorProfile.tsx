import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GraduationCap,
  BookOpen,
  Crown,
  Globe,
  AlertCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CourseCard from "@/components/CourseCard";
import type { PublicCourse } from "@/hooks/use-public-courses";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { supabase } from "@/integrations/supabase/client";

// ── Social icon map ──────────────────────────────────────────────
const SOCIAL_ICONS: Record<string, JSX.Element> = {
  youtube: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  ),
  facebook: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  instagram: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  ),
  twitter: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  ),
  telegram: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  ),
  whatsapp: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.72-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  tiktok: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  ),
  linkedin: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  snapchat: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
    </svg>
  ),
};

function getSocialIcon(platform: string): JSX.Element {
  const key = platform.toLowerCase().trim();
  return SOCIAL_ICONS[key] ?? <Globe className="w-4 h-4" />;
}

export interface InstructorProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: { platform: string; url: string }[];
  user_role: string;
  is_primary_admin: boolean;
}

export default function PublicInstructorProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState<InstructorProfile | null>(null);
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      // Fetch profile via public RPC
      (supabase as any).rpc("get_public_instructor_profile", { _user_id: userId }),

      // Fetch published courses created by this instructor
      (supabase as any)
        .from("courses")
        .select("id, title, description, thumbnail_url, status, is_featured, is_paid, price_piastres, discount_price_piastres, discount_expires_at, scheduled_publish_at, stage_id, subject_id, created_at, stages(name), subjects(name), units(id)")
        .eq("created_by", userId)
        .eq("status", "published")
        .order("created_at", { ascending: false }),
    ])
      .then(([{ data: pData, error: pErr }, { data: cData }]) => {
        if (cancelled) return;
        if (pErr || !pData || !pData.id) {
          setProfile(null);
        } else {
          setProfile(pData as InstructorProfile);
        }

        const mapped: PublicCourse[] = (cData ?? []).map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          thumbnail_url: c.thumbnail_url,
          stage_id: c.stage_id,
          stage_name: c.stages?.name ?? null,
          subject_id: c.subject_id ?? null,
          subject_name: c.subjects?.name ?? null,
          units_count: c.units?.length ?? 0,
          lessons_count: 0,
          quizzes_count: 0,
          assignments_count: 0,
          questions_count: 0,
          created_at: c.created_at,
          is_paid: !!c.is_paid,
          price_piastres: c.price_piastres ?? null,
          discount_price_piastres: c.discount_price_piastres ?? null,
          discount_expires_at: c.discount_expires_at ?? null,
          status: c.status,
          scheduled_publish_at: c.scheduled_publish_at ?? null,
          is_featured: !!c.is_featured,
        }));

        setCourses(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setCourses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const initials =
    profile?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "م";

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl space-y-12">
          {loading ? (
            <div className="space-y-6 max-w-3xl mx-auto">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-64 rounded-3xl" />
            </div>
          ) : !profile ? (
            <div className="text-center py-20 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold">المحاضر غير موجود</h1>
              <p className="text-sm text-muted-foreground">
                لم نتمكن من العثور على الصفحة المطلوبة أو تم حذف الحساب.
              </p>
              <Link to="/courses" className="inline-block">
                <Badge variant="outline" className="px-4 py-2">
                  تصفح كل الدورات
                </Badge>
              </Link>
            </div>
          ) : (
            <>
              {/* ── Profile Hero Card ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 md:p-10 shadow-xl"
              >
                {/* Background geometric accents */}
                <EightPointStar
                  size={120}
                  className="absolute -top-10 -left-10 text-primary/[0.04] pointer-events-none"
                />
                <EightPointStar
                  size={90}
                  className="absolute -bottom-8 -right-8 text-primary/[0.04] pointer-events-none"
                />

                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
                  {/* Avatar */}
                  <Avatar className="w-28 h-28 md:w-36 md:h-36 border-4 border-primary/20 shadow-2xl shrink-0">
                    <AvatarImage src={profile.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-black">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* Details */}
                  <div className="flex-1 text-center md:text-right space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                      <h1 className="text-2xl md:text-4xl font-black text-foreground">
                        {profile.full_name || "محاضر المنصة"}
                      </h1>
                      {profile.is_primary_admin ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-300/40">
                          <Crown className="w-3.5 h-3.5" />
                          الأدمن الرئيسي
                        </span>
                      ) : profile.user_role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/30">
                          <GraduationCap className="w-3.5 h-3.5" />
                          محاضر معتمد
                        </span>
                      ) : null}
                    </div>

                    {/* Bio */}
                    {profile.bio ? (
                      <p className="text-base text-muted-foreground leading-relaxed max-w-2xl whitespace-pre-line">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/70 italic">
                        محاضر لدى منصة منى كامل التعليمية.
                      </p>
                    )}

                    {/* Social Links */}
                    {profile.social_links.length > 0 && (
                      <div className="pt-2 flex items-center justify-center md:justify-start gap-2 flex-wrap">
                        {profile.social_links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={link.platform}
                            className="w-9 h-9 rounded-xl bg-secondary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors shadow-sm"
                          >
                            {getSocialIcon(link.platform)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* ── Divider ── */}
              <IslamicDivider />

              {/* ── Instructor Courses Grid ── */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl md:text-2xl font-black">الدورات المنشورة</h2>
                      <p className="text-xs text-muted-foreground">
                        {courses.length === 0
                          ? "لا توجد دورات منشورة لهذا المحاضر حالياً"
                          : `إجمالي ${courses.length} دورة تعليمية`}
                      </p>
                    </div>
                  </div>
                </div>

                {courses.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-16 text-center rounded-3xl border border-dashed border-border/80 bg-card/40 p-8 space-y-3"
                  >
                    <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                    <div className="font-bold text-foreground">لا توجد دورات منشورة حتى الآن</div>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      لم يتم نشر دورات تعليمية عامة بواسطة هذا المحاضر حتى الآن.
                    </p>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {courses.map((courseItem, index) => (
                      <CourseCard
                        key={courseItem.id}
                        course={courseItem}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
