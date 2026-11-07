import { useEffect, useState } from "react";
import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  AiApiError,
  saveProvider,
  testDraftProvider,
  type AiProvider,
  type ApiFormat,
  type CheckResult,
} from "@/lib/ai-api";
import TestConnectionChecklist from "./TestConnectionChecklist";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: AiProvider | null; // null = create
  onSaved: (p: AiProvider) => void;
}

interface FormState {
  name: string;
  api_format: ApiFormat;
  base_url: string;
  model_id: string;
  api_key: string;
  temperature: number;
  max_output_tokens: number;
}

const EMPTY: FormState = {
  name: "",
  api_format: "openai_compatible",
  base_url: "",
  model_id: "",
  api_key: "",
  temperature: 0.2,
  max_output_tokens: 2048,
};

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState, isEdit: boolean): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "الاسم مطلوب";
  else if (f.name.trim().length > 80) e.name = "الاسم طويل جداً";
  if (!/^https:\/\/\S+$/.test(f.base_url.trim())) e.base_url = "يجب أن يبدأ الرابط بـ https://";
  if (!f.model_id.trim()) e.model_id = "معرّف النموذج مطلوب";
  if (!isEdit && !f.api_key.trim()) e.api_key = "مفتاح API مطلوب";
  if (!Number.isInteger(f.max_output_tokens) || f.max_output_tokens < 64 || f.max_output_tokens > 32000) {
    e.max_output_tokens = "بين 64 و 32000";
  }
  return e;
}

const ProviderDialog = ({ open, onOpenChange, provider, onSaved }: Props) => {
  const isEdit = Boolean(provider);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checks, setChecks] = useState<CheckResult[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      provider
        ? {
            name: provider.name,
            api_format: provider.api_format,
            base_url: provider.base_url,
            model_id: provider.model_id,
            api_key: "",
            temperature: Number(provider.temperature),
            max_output_tokens: provider.max_output_tokens,
          }
        : EMPTY,
    );
    setTouched({});
    setChecks(null);
    setShowKey(false);
  }, [open, provider]);

  const errors = validate(form, isEdit);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const blur = (k: keyof FormState) => setTouched((t) => ({ ...t, [k]: true }));
  const err = (k: keyof FormState) => (touched[k] ? errors[k] : undefined);

  const draft = () => ({
    id: provider?.id,
    name: form.name.trim(),
    api_format: form.api_format,
    base_url: form.base_url.trim(),
    model_id: form.model_id.trim(),
    temperature: form.temperature,
    max_output_tokens: form.max_output_tokens,
    ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
  });

  const touchAll = () =>
    setTouched({ name: true, base_url: true, model_id: true, api_key: true, max_output_tokens: true });

  const runTest = async () => {
    touchAll();
    if (Object.keys(errors).length) return;
    setTesting(true);
    setChecks([]);
    try {
      const { result } = await testDraftProvider(draft());
      setChecks(result.checks);
    } catch (e) {
      setChecks(null);
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر تشغيل الاختبار");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    touchAll();
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const { provider: saved } = await saveProvider(draft());
      toast.success("تم حفظ المزوّد");
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المزوّد" : "إضافة مزوّد"}</DialogTitle>
          <DialogDescription>أي مزوّد متوافق مع OpenAI أو Anthropic. يُحفظ المفتاح مشفّراً ولا يُعرض مرة أخرى.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-p-name">الاسم</Label>
            <Input
              id="ai-p-name"
              value={form.name}
              maxLength={80}
              placeholder="مثال: النموذج الرئيسي"
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => blur("name")}
              aria-invalid={Boolean(err("name"))}
            />
            {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>الصيغة</Label>
            <Select value={form.api_format} onValueChange={(v) => set("api_format", v as ApiFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai_compatible">OpenAI متوافق</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-p-url">Base URL</Label>
            <Input
              id="ai-p-url"
              dir="ltr"
              value={form.base_url}
              placeholder={form.api_format === "anthropic" ? "https://api.anthropic.com" : "https://api.example.com/v1"}
              onChange={(e) => set("base_url", e.target.value)}
              onBlur={() => blur("base_url")}
              aria-invalid={Boolean(err("base_url"))}
            />
            {err("base_url") && <p className="text-xs text-destructive">{err("base_url")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-p-model">Model ID</Label>
            <Input
              id="ai-p-model"
              dir="ltr"
              className="font-mono text-sm"
              value={form.model_id}
              onChange={(e) => set("model_id", e.target.value)}
              onBlur={() => blur("model_id")}
              aria-invalid={Boolean(err("model_id"))}
            />
            {err("model_id") && <p className="text-xs text-destructive">{err("model_id")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-p-key">API Key</Label>
            <div className="relative">
              <Input
                id="ai-p-key"
                dir="ltr"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                className="pe-10 font-mono text-sm"
                value={form.api_key}
                placeholder={isEdit ? "اتركه فارغاً للإبقاء على المفتاح الحالي" : ""}
                onChange={(e) => set("api_key", e.target.value)}
                onBlur={() => blur("api_key")}
                aria-invalid={Boolean(err("api_key"))}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isEdit && provider?.key_last4 && !form.api_key && (
              <p className="text-xs text-muted-foreground" dir="ltr">••••{provider.key_last4}</p>
            )}
            {err("api_key") && <p className="text-xs text-destructive">{err("api_key")}</p>}
          </div>

          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              خيارات متقدمة
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>الحرارة</Label>
                  <span className="text-sm tabular-nums text-muted-foreground">{form.temperature.toFixed(1)}</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={[form.temperature]}
                  onValueChange={([v]) => set("temperature", v)}
                />
                <p className="text-xs text-muted-foreground">قيمة منخفضة = ردود أدق وأقل عشوائية (مستحسن لمساعد الإدارة).</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-p-max">أقصى طول للرد (توكن)</Label>
                <Input
                  id="ai-p-max"
                  type="number"
                  dir="ltr"
                  min={64}
                  max={32000}
                  value={form.max_output_tokens}
                  onChange={(e) => set("max_output_tokens", Number(e.target.value))}
                  onBlur={() => blur("max_output_tokens")}
                />
                {err("max_output_tokens") && <p className="text-xs text-destructive">{err("max_output_tokens")}</p>}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <TestConnectionChecklist results={checks} running={testing} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={save} disabled={saving || testing}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={runTest} disabled={saving || testing}>
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            اختبار الاتصال
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderDialog;
