import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Plus,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProviderDialog from "@/components/ai/ProviderDialog";
import TestConnectionChecklist from "@/components/ai/TestConnectionChecklist";
import UsageMeters from "@/components/ai/UsageMeters";
import PlanCards from "@/components/ai/PlanCards";
import UsageChart from "@/components/ai/UsageChart";
import {
  AiApiError,
  applyPlanChange,
  deleteProvider,
  getAiSettings,
  getUsageDaily,
  getUsageLog,
  getUsageSnapshot,
  setActiveProvider,
  testProvider,
  updateAiSettings,
  type AiProvider,
  type AiSettings,
  type CheckResult,
} from "@/lib/ai-api";
import { formatCairo } from "@/lib/cairo-time";

const TABS = ["general", "providers", "plan", "usage"] as const;
type Tab = (typeof TABS)[number];
const KEY = ["ai-settings"] as const;

const card = "rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-sm";

// ---------------------------------------------------------------- general tab
type Editable = Pick<
  AiSettings,
  | "chatbot_enabled"
  | "admin_chat_enabled"
  | "grading_enabled"
  | "grading_mode"
  | "count_admin_usage"
  | "student_limit_per_hour"
  | "student_limit_per_day"
  | "guest_limit_per_hour"
  | "guest_limit_per_day"
>;

const LIMIT_FIELDS: { key: keyof Editable; label: string; max: number }[] = [
  { key: "student_limit_per_hour", label: "الطالب في الساعة", max: 1000 },
  { key: "student_limit_per_day", label: "الطالب في اليوم", max: 10000 },
  { key: "guest_limit_per_hour", label: "الزائر في الساعة", max: 1000 },
  { key: "guest_limit_per_day", label: "الزائر في اليوم", max: 10000 },
];

function pick(s: AiSettings): Editable {
  return {
    chatbot_enabled: s.chatbot_enabled,
    admin_chat_enabled: s.admin_chat_enabled,
    grading_enabled: s.grading_enabled,
    grading_mode: s.grading_mode,
    count_admin_usage: s.count_admin_usage,
    student_limit_per_hour: s.student_limit_per_hour,
    student_limit_per_day: s.student_limit_per_day,
    guest_limit_per_hour: s.guest_limit_per_hour,
    guest_limit_per_day: s.guest_limit_per_day,
  };
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function GeneralTab({ settings, onSaved }: { settings: AiSettings; onSaved: (s: AiSettings) => void }) {
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState<Editable>(() => pick(settings));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(pick(settings)), [settings]);

  const base = pick(settings);
  const dirty = (Object.keys(base) as (keyof Editable)[]).some((k) => base[k] !== draft[k]);
  const limitErrors = LIMIT_FIELDS.filter(
    (f) => !Number.isInteger(draft[f.key]) || (draft[f.key] as number) < 0 || (draft[f.key] as number) > f.max,
  ).map((f) => f.key);

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (limitErrors.length) return;
    setSaving(true);
    try {
      const patch: Partial<Editable> = {};
      for (const k of Object.keys(draft) as (keyof Editable)[]) {
        if (draft[k] !== base[k]) (patch as Record<string, unknown>)[k] = draft[k];
      }
      const { settings: saved } = await updateAiSettings(patch);
      onSaved(saved);
      toast.success("تم حفظ الإعدادات");
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-24">
      <section className={card}>
        <h2 className="text-lg font-bold">التحكم</h2>
        <div className="mt-2 divide-y divide-border/60">
          <ToggleRow
            id="ai-chatbot"
            label="المساعد الذكي للزوار والطلاب"
            help="إظهار أيقونة المحادثة في واجهة الموقع"
            checked={draft.chatbot_enabled}
            onChange={(v) => set("chatbot_enabled", v)}
          />
          <ToggleRow
            id="ai-admin-chat"
            label="مساعد الإدارة"
            help="تفعيل صفحة المساعد الذكي في لوحة التحكم"
            checked={draft.admin_chat_enabled}
            onChange={(v) => set("admin_chat_enabled", v)}
          />
          <div className="py-3">
            <ToggleRow
              id="ai-grading"
              label="التصحيح الآلي للأسئلة المقالية"
              help="يقترح أو يرصد درجات الإجابات المكتوبة في الواجبات والاختبارات"
              checked={draft.grading_enabled}
              onChange={(v) => set("grading_enabled", v)}
            />
            {draft.grading_enabled && (
              <RadioGroup
                value={draft.grading_mode}
                onValueChange={(v) => set("grading_mode", v as Editable["grading_mode"])}
                className="mt-1 grid gap-2 sm:grid-cols-2"
              >
                {[
                  { v: "suggest", label: "اقتراح فقط (يعتمده المعلم)" },
                  { v: "auto_apply", label: "رصد تلقائي" },
                ].map((o) => (
                  <Label
                    key={o.v}
                    htmlFor={`gm-${o.v}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
                      draft.grading_mode === o.v ? "border-primary bg-primary/5" : "border-border/60"
                    }`}
                  >
                    <RadioGroupItem id={`gm-${o.v}`} value={o.v} />
                    {o.label}
                  </Label>
                ))}
              </RadioGroup>
            )}
          </div>
          <ToggleRow
            id="ai-count-admin"
            label="احتساب رسائل الإدارة ضمن الباقة"
            help="عند الإيقاف تُسجَّل رسائل الإدارة دون أن تُخصم من حدود الباقة"
            checked={draft.count_admin_usage}
            onChange={(v) => set("count_admin_usage", v)}
          />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">حدود الرسائل</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          تُطبّق هذه الحدود لكل مستخدم، بالإضافة إلى حدود الباقة الإجمالية.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {LIMIT_FIELDS.map((f) => {
            const invalid = limitErrors.includes(f.key);
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`lim-${f.key}`}>{f.label}</Label>
                <div className="relative">
                  <Input
                    id={`lim-${f.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={f.max}
                    className="pe-16 tabular-nums"
                    value={String(draft[f.key])}
                    aria-invalid={invalid}
                    onChange={(e) => set(f.key, (e.target.value === "" ? NaN : Number(e.target.value)) as never)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">
                    رسالة
                  </span>
                </div>
                {invalid && <p className="text-xs text-destructive">قيمة بين 0 و {f.max.toLocaleString("en-US")}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={reduce ? undefined : { y: 24, opacity: 0 }}
            animate={reduce ? undefined : { y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 24, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 px-4 md:bottom-6"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
              <span className="text-sm font-medium">لديك تغييرات غير محفوظة</span>
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving || limitErrors.length > 0}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </Button>
                <Button variant="ghost" onClick={() => setDraft(base)} disabled={saving}>
                  تراجع
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- providers tab
function TestBadge({ p }: { p: AiProvider }) {
  if (!p.last_test_at || !p.last_test_result) return <span className="text-xs text-muted-foreground">لم يُختبر</span>;
  const ok = p.last_test_result.checks.every((c) => c.ok !== false);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
      {formatDistanceToNowStrict(new Date(p.last_test_at), { locale: ar, addSuffix: true })}
    </span>
  );
}

function ProvidersTab({
  providers,
  settings,
  onChanged,
}: {
  providers: AiProvider[];
  settings: AiSettings;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; provider: AiProvider | null }>({ open: false, provider: null });
  const [testing, setTesting] = useState<{ id: string; checks: CheckResult[] | null; running: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<AiProvider | null>(null);

  const runTest = async (p: AiProvider) => {
    setTesting({ id: p.id, checks: [], running: true });
    try {
      const { result } = await testProvider(p.id);
      setTesting({ id: p.id, checks: result.checks, running: false });
      onChanged();
    } catch (e) {
      setTesting(null);
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر تشغيل الاختبار");
    }
  };

  const activate = async (p: AiProvider, kind: "chat" | "grading") => {
    try {
      const { warning } = await setActiveProvider(p.id, kind);
      toast.success(kind === "chat" ? "تم تعيين المزوّد للمحادثة" : "تم تعيين المزوّد للتصحيح");
      if (warning === "TOOLS_UNSUPPORTED") toast.warning("هذا النموذج لا يدعم الأدوات — مساعد الإدارة لن يعمل معه.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحفظ");
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteProvider(toDelete.id);
      toast.success("تم حذف المزوّد");
      onChanged();
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحذف");
    } finally {
      setToDelete(null);
    }
  };

  const inUse = (p: AiProvider) => settings.active_provider_id === p.id || settings.grading_provider_id === p.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">المزوّدون والنماذج</h2>
        <Button onClick={() => setDialog({ open: true, provider: null })}>
          <Plus className="h-4 w-4" />
          إضافة مزوّد
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-3 py-12 text-center`}>
          <div className="rounded-full bg-muted p-4">
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">لم تُضف أي مزوّد بعد</p>
          <p className="text-sm text-muted-foreground">أضف مزوّداً ونموذجاً لتفعيل المساعد الذكي</p>
          <Button className="mt-2" onClick={() => setDialog({ open: true, provider: null })}>
            <Plus className="h-4 w-4" />
            إضافة مزوّد
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {settings.active_provider_id === p.id && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">نشط للمحادثة</span>
                    )}
                    {settings.grading_provider_id === p.id && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">للتصحيح</span>
                    )}
                    {p.supports_tools === false && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">بدون أدوات</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{p.api_format === "anthropic" ? "Anthropic" : "OpenAI متوافق"}</span>
                    <span className="font-mono text-xs" dir="ltr">{p.model_id}</span>
                    <span className="font-mono text-xs" dir="ltr">••••{p.key_last4 ?? ""}</span>
                    <TestBadge p={p} />
                  </div>
                </div>
                <DropdownMenu dir="rtl">
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="إجراءات المزوّد">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => runTest(p)}>اختبار الاتصال</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog({ open: true, provider: p })}>تعديل</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => activate(p, "chat")}>تعيين للمحادثة</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => activate(p, "grading")}>تعيين للتصحيح</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {inUse(p) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <DropdownMenuItem disabled className="text-destructive">
                              حذف
                            </DropdownMenuItem>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>لا يمكن حذف المزوّد النشط</TooltipContent>
                      </Tooltip>
                    ) : (
                      <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(p)}>
                        حذف
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {testing?.id === p.id && (
                <div className="mt-4">
                  <TestConnectionChecklist results={testing.checks} running={testing.running} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProviderDialog
        open={dialog.open}
        provider={dialog.provider}
        onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        onSaved={onChanged}
      />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المزوّد؟</AlertDialogTitle>
            <AlertDialogDescription>سيُحذف «{toDelete?.name}» ومفتاحه نهائياً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------- plan tab
function PlanTab({ bundle, onChanged }: { bundle: NonNullable<ReturnType<typeof useBundle>["data"]>; onChanged: () => void }) {
  const snapshot = useQuery({
    queryKey: ["ai-usage-snapshot"],
    queryFn: getUsageSnapshot,
    refetchInterval: 30_000,
    initialData: { usage: bundle.usage },
  });
  const daily = useQuery({ queryKey: ["ai-usage-daily"], queryFn: getUsageDaily });
  const usage = snapshot.data.usage;
  const plan = bundle.plans.find((p) => p.id === bundle.subscription.plan_id) ?? usage.plan;
  const pending = bundle.pending_requests[0];

  const decide = async (decision: "applied" | "rejected") => {
    if (!pending) return;
    try {
      await applyPlanChange(pending.id, decision);
      toast.success(decision === "applied" ? "تم تطبيق الباقة" : "تم رفض الطلب");
      onChanged();
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحفظ");
    }
  };

  return (
    <div className="space-y-5">
      {pending && bundle.viewer.is_primary_admin && (
        <Alert>
          <AlertTitle>
            طلب ترقية معلّق إلى {bundle.plans.find((p) => p.id === pending.to_plan)?.name_ar ?? pending.to_plan}
          </AlertTitle>
          <AlertDescription className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => decide("applied")}>تطبيق</Button>
            <Button size="sm" variant="outline" onClick={() => decide("rejected")}>رفض</Button>
          </AlertDescription>
        </Alert>
      )}

      <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{plan.name_ar}</h2>
            {usage.expired ? (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">منتهية</span>
            ) : (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">نشطة</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">يتجدد في {formatCairo(usage.renews_at, "date")}</p>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tabular-nums" dir="ltr">${(plan.price_usd_cents / 100).toLocaleString("en-US")}</span>
          <span className="text-sm text-muted-foreground">/ شهرياً</span>
        </div>
      </section>

      <UsageMeters usage={usage} />

      <section className={card}>
        <h3 className="mb-4 font-bold">الاستخدام خلال 30 يوماً</h3>
        {daily.isLoading ? <Skeleton className="h-64 w-full" /> : <UsageChart rows={daily.data?.rows ?? []} />}
      </section>

      <section className="space-y-3">
        <h3 className="font-bold">الباقات</h3>
        <PlanCards
          plans={bundle.plans}
          currentPlanId={bundle.subscription.plan_id}
          pending={bundle.pending_requests}
          onRequested={onChanged}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- usage log tab
const ACTOR_AR: Record<string, string> = { admin: "إدارة", student: "طالب", parent: "ولي أمر", guest: "زائر", system: "النظام" };
const SURFACE_AR: Record<string, string> = { admin_chat: "مساعد الإدارة", widget: "أيقونة الموقع", grading: "التصحيح", test: "اختبار" };

function UsageLogTab() {
  const [actor, setActor] = useState<string>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage-log", actor],
    queryFn: () => getUsageLog(actor === "all" ? undefined : actor),
  });
  const rows = data?.rows ?? [];
  return (
    <section className={card}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">سجل الاستخدام</h2>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(ACTOR_AR).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">لا توجد سجلات بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                {["الوقت", "النوع", "المستخدم", "الواجهة", "محتسبة", "التوكنز", "المدة", "النتيجة"].map((h) => (
                  <th key={h} className="px-2 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2 whitespace-nowrap">{formatCairo(r.occurred_at, "datetime")}</td>
                  <td className="px-2 py-2">{ACTOR_AR[r.actor_type] ?? r.actor_type}</td>
                  <td className="px-2 py-2 font-mono text-xs" dir="ltr">{r.actor_key}</td>
                  <td className="px-2 py-2">{SURFACE_AR[r.surface] ?? r.surface}</td>
                  <td className="px-2 py-2">{r.counted ? "نعم" : "لا"}</td>
                  <td className="px-2 py-2 tabular-nums" dir="ltr">
                    {r.tokens_in ?? 0} / {r.tokens_out ?? 0}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{r.latency_ms != null ? `${(r.latency_ms / 1000).toFixed(1)} ث` : "—"}</td>
                  <td className="px-2 py-2">{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- page
function useBundle() {
  return useQuery({ queryKey: KEY, queryFn: getAiSettings });
}

const AdminAiSettings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useBundle();

  const tab: Tab = useMemo(() => {
    const h = location.hash.replace("#", "") as Tab;
    return TABS.includes(h) ? h : "general";
  }, [location.hash]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["ai-usage-snapshot"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <div>
        <Link
          to="/admin/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          الإعدادات
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">إعدادات الذكاء الاصطناعي</h1>
            <p className="mt-1 text-sm text-muted-foreground">تحكّم في المساعد الذكي ومزوّدي النماذج وحدود الاستخدام.</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : error || !data ? (
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الإعدادات</AlertTitle>
          <AlertDescription>
            {error instanceof AiApiError ? error.messageAr : "حاول تحديث الصفحة."}
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={tab} onValueChange={(v) => navigate({ hash: v }, { replace: true })} dir="rtl">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="general">عام</TabsTrigger>
            <TabsTrigger value="providers">المزوّدون والنماذج</TabsTrigger>
            <TabsTrigger value="plan">الباقة والاستهلاك</TabsTrigger>
            <TabsTrigger value="usage">سجل الاستخدام</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="mt-5">
            <GeneralTab
              settings={data.settings}
              onSaved={(s) => qc.setQueryData(KEY, { ...data, settings: s })}
            />
          </TabsContent>
          <TabsContent value="providers" className="mt-5">
            <ProvidersTab providers={data.providers} settings={data.settings} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="plan" className="mt-5">
            <PlanTab bundle={data} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="usage" className="mt-5">
            <UsageLogTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default AdminAiSettings;
