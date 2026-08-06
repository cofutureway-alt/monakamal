import { motion } from "framer-motion";
import { Crown, Medal, Trophy, User, Award, Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { usePublicLeaderboardTop10 } from "@/hooks/useBadges";

export default function LeaderboardPage() {
  const { data, isLoading } = usePublicLeaderboardTop10();
  const rows = (data ?? []) as any[];

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3, 10);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              أوائل متفوقي الرياضيات
            </div>
            <h1 className="text-4xl md:text-6xl font-black">المتصدرون</h1>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              أفضل عشرة طلاب على المنصة، مصنّفون بناءً على النقاط المكتسبة من إكمال الدروس والاختبارات والواجبات.
            </p>
          </motion.div>

          {isLoading ? (
            <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
          ) : rows.length === 0 ? (
            <Card className="p-14 text-center max-w-lg mx-auto">
              <Trophy className="w-14 h-14 text-amber-500/50 mx-auto mb-3" />
              <h2 className="font-bold text-lg">لا يوجد طلاب على المتصدرين حاليًا</h2>
              <p className="text-sm text-muted-foreground mt-2">كن أول من يبدأ التعلم!</p>
            </Card>
          ) : (
            <>
              {/* Podium — 3 columns on mobile and desktop */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-4 md:gap-6 max-w-5xl mx-auto items-end mb-12">
                {top3.length >= 3 && <PodiumSlot rank={3} row={top3[2]} delay={0} />}
                {top3.length >= 2 && <PodiumSlot rank={2} row={top3[1]} delay={0.15} />}
                {top3.length >= 1 && <PodiumSlot rank={1} row={top3[0]} delay={0.3} />}
              </div>

              {/* Ranks 4-10 */}
              {rest.length > 0 && (
                <div className="max-w-3xl mx-auto space-y-2">
                  {rest.map((r, i) => (
                    <motion.div
                      key={r.student_id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.05 }}
                    >
                      <Card className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center font-black text-lg">
                          {r.rank}
                        </div>
                        <Avatar className="w-11 h-11 border-2 border-border">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{r.full_name || "بدون اسم"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            {r.level_name && (
                              <span className="inline-flex items-center gap-1">
                                {r.level_icon_url && <img src={r.level_icon_url} className="w-3.5 h-3.5" alt="" />}
                                {r.level_name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Award className="w-3.5 h-3.5" /> {r.badge_count}
                            </span>
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-black text-lg text-indigo-500">{r.total_points}</div>
                          <div className="text-[10px] text-muted-foreground">نقطة</div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function PodiumSlot({ rank, row, delay }: { rank: 1 | 2 | 3; row: any; delay: number }) {
  const cfg = rank === 1
    ? { badgeText: "الأول", badgeBg: "bg-amber-500 text-white shadow-amber-500/20", icon: <Crown className="text-amber-500 w-4 h-4 sm:w-6 sm:h-6 drop-shadow" strokeWidth={2.2} />, height: "min-h-[220px] sm:min-h-[300px] md:min-h-[340px] -translate-y-2 sm:-translate-y-3 border-amber-500/40", order: "order-2" }
    : rank === 2
    ? { badgeText: "الثاني", badgeBg: "bg-slate-400 text-white shadow-slate-400/20", icon: <Medal className="text-slate-300 w-3.5 h-3.5 sm:w-5 sm:h-5 drop-shadow" strokeWidth={2.2} />, height: "min-h-[190px] sm:min-h-[260px] md:min-h-[290px]", order: "order-1" }
    : { badgeText: "الثالث", badgeBg: "bg-amber-700 text-white shadow-amber-700/20", icon: <Medal className="text-amber-700 w-3.5 h-3.5 sm:w-5 sm:h-5 drop-shadow" strokeWidth={2.2} />, height: "min-h-[190px] sm:min-h-[260px] md:min-h-[290px]", order: "order-3" };

  const initials = (row.full_name || "؟")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0])
    .join("")
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={cfg.order}
    >
      <div className={`relative flex flex-col items-center p-2.5 sm:p-5 pt-6 sm:pt-8 rounded-2xl sm:rounded-[2rem] border border-border/80 bg-card/90 shadow-lg transition-all duration-300 hover:-translate-y-2 ${cfg.height}`}>
        {/* Top Pill Badge */}
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 sm:px-5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-md tracking-wide whitespace-nowrap ${cfg.badgeBg}`}>
          {cfg.badgeText}
        </div>

        {/* Avatar Container */}
        <div className="relative mt-2 sm:mt-3 mb-2 sm:mb-3">
          <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full border-2 border-border/80 bg-background/50 flex items-center justify-center p-0.5 shadow-inner">
            <Avatar className="w-full h-full rounded-full">
              <AvatarImage src={row.avatar_url ?? undefined} className="object-cover" />
              <AvatarFallback className="bg-primary/5 text-foreground text-sm sm:text-lg font-extrabold">
                {initials || <User className="w-5 h-5" />}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Math Symbol Watermark */}
          <div className="absolute top-0.5 left-0 text-[8px] sm:text-[10px] font-bold text-muted-foreground/40 border border-muted-foreground/20 rounded-full w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">
            π
          </div>

          {/* Crown / Medal Badge */}
          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 sm:p-1 border border-border/60 shadow-md">
            {cfg.icon}
          </div>
        </div>

        {/* Student Name */}
        <h3 className="text-[11px] sm:text-xs md:text-sm font-bold text-foreground text-center line-clamp-2 leading-tight w-full min-h-[2.25rem] flex items-center justify-center my-1 break-words">
          {row.full_name || "بدون اسم"}
        </h3>

        {/* Points */}
        <div className="mt-auto flex items-baseline justify-center gap-1 sm:gap-1.5 pt-1">
          <span className="text-lg sm:text-2xl md:text-3xl font-black text-foreground tabular-nums">{row.total_points}</span>
          <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">نقطة</span>
        </div>
      </div>
    </motion.div>
  );
}
