import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Medal, Crown, User, Award, ChevronLeft } from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { usePublicLeaderboardTop10 } from "@/hooks/useBadges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const RANK_CFG: Record<number, { icon: JSX.Element; badgeBg: string; badgeText: string; isFirst: boolean; gridOrder: string }> = {
  1: {
    icon: <Crown className="text-amber-500 w-4 h-4 sm:w-6 sm:h-6 drop-shadow" strokeWidth={2.2} />,
    badgeBg: "bg-amber-500 text-white shadow-amber-500/20",
    badgeText: "الأول",
    isFirst: true,
    gridOrder: "order-2",
  },
  2: {
    icon: <Medal className="text-slate-300 w-3.5 h-3.5 sm:w-5 sm:h-5 drop-shadow" strokeWidth={2.2} />,
    badgeBg: "bg-slate-400 text-white shadow-slate-400/20",
    badgeText: "الثاني",
    isFirst: false,
    gridOrder: "order-1",
  },
  3: {
    icon: <Medal className="text-amber-700 w-3.5 h-3.5 sm:w-5 sm:h-5 drop-shadow" strokeWidth={2.2} />,
    badgeBg: "bg-amber-700 text-white shadow-amber-700/20",
    badgeText: "الثالث",
    isFirst: false,
    gridOrder: "order-3",
  },
};

const TopThreeCard = ({ row, rank, isVisible }: { row: any; rank: 1 | 2 | 3; isVisible: boolean }) => {
  const config = RANK_CFG[rank];
  const initials = (row.full_name || "؟")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`relative flex flex-col items-center p-2.5 sm:p-5 pt-6 sm:pt-8 rounded-2xl sm:rounded-[2rem] border border-border/80 bg-card/90 shadow-lg transition-all duration-300 ${
        config.gridOrder
      } ${config.isFirst ? "min-h-[220px] sm:min-h-[300px] md:min-h-[340px] -translate-y-2 sm:-translate-y-3 border-amber-500/40" : "min-h-[190px] sm:min-h-[260px] md:min-h-[290px]"} ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {/* Top Pill Badge */}
      <div
        className={`absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 sm:px-5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-md tracking-wide whitespace-nowrap ${config.badgeBg}`}
      >
        {config.badgeText}
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
          {config.icon}
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
  );
};

const LeaderboardSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { data, isLoading } = usePublicLeaderboardTop10();
  const rows = (data ?? []) as any[];

  return (
    <section id="leaderboard" className="py-16 md:py-24 relative overflow-hidden">
      <EightPointStar size={50} className="absolute top-12 right-12 text-primary/5 animate-spin-slow" />
      <EightPointStar size={35} className="absolute bottom-12 left-12 text-primary/5 animate-spin-slow" style={{ animationDirection: "reverse" }} />

      <div className="container mx-auto px-4 max-w-4xl relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />
        <h2 className={`text-2xl md:text-4xl font-bold text-center mb-2 md:mb-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          لوحة المتصدرين
        </h2>
        <p className={`text-sm md:text-base text-muted-foreground text-center mb-8 md:mb-12 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          أفضل الطلاب أداءً على المنصة
        </p>

        {isLoading ? (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-8">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 md:h-56 rounded-2xl" />)}
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          </>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-border/50">
            <Trophy className="w-12 h-12 mx-auto text-primary/30 mb-3" />
            <p className="text-muted-foreground">لا يوجد طلاب على المتصدرين حاليًا</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-8 items-end px-2 md:px-0">
              {rows.slice(0, 3).map((r, i) => (
                <TopThreeCard key={r.student_id} row={r} rank={(i + 1) as 1 | 2 | 3} isVisible={isVisible} />
              ))}
            </div>

            <div className="space-y-3">
              {rows.slice(3).map((r, i) => {
                const initials = (r.full_name || "؟").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();
                return (
                  <div
                    key={r.student_id}
                    className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border border-border transition-all duration-500 hover:shadow-md hover:border-primary/40 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                    style={{ transitionDelay: `${400 + i * 80}ms` }}
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-xs md:text-sm shrink-0">
                      {r.rank}
                    </div>
                    <Avatar className="w-9 h-9 md:w-10 md:h-10 border border-border shrink-0">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-semibold text-xs md:text-sm truncate">{r.full_name || "بدون اسم"}</span>
                    {r.badge_count > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-amber-600 font-bold">
                        <Award className="w-3.5 h-3.5" /> {r.badge_count}
                      </span>
                    )}
                    <span className="text-xs md:text-sm font-bold text-primary tabular-nums">{r.total_points}</span>
                    <span className="text-[10px] md:text-xs text-muted-foreground">نقطة</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Link to="/leaderboard">
                <Button variant="outline" className="gap-2">
                  عرض القائمة الكاملة
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default LeaderboardSection;
