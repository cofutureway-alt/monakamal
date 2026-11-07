import { motion, useReducedMotion } from "framer-motion";

export interface CountdownTilesProps {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True in the last 10 minutes: accent colour + pulsing ring. */
  urgent?: boolean;
}

const Tile = ({ value, label }: { value: number; label: string }) => (
  <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-card border border-border flex flex-col items-center justify-center">
    <div className="text-3xl font-bold tabular-nums">{String(value).padStart(2, "0")}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const CountdownTiles = ({ days, hours, minutes, seconds, urgent = false }: CountdownTilesProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`flex flex-wrap justify-center gap-3 rounded-2xl ${
        urgent ? "ring-2 ring-accent/40" : ""
      }`}
    >
      {days > 0 && (
        <div className={urgent ? "text-accent [&_.text-3xl]:text-accent" : ""}>
          <Tile value={days} label="أيام" />
        </div>
      )}
      {[
        { value: hours, label: "ساعات" },
        { value: minutes, label: "دقائق" },
        { value: seconds, label: "ثوانٍ" },
      ].map((t) => (
        <motion.div
          key={t.label}
          className={urgent ? "text-accent [&_.text-3xl]:text-accent" : ""}
          animate={urgent && !reduceMotion ? { scale: [1, 1.03, 1] } : undefined}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Tile value={t.value} label={t.label} />
        </motion.div>
      ))}
    </div>
  );
};

export default CountdownTiles;
