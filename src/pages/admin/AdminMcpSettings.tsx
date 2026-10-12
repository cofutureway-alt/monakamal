import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SCOPES = [
  ["users", "المستخدمون"], ["courses", "الدورات"], ["bundles", "الباقات"],
  ["lessons", "الدروس"], ["quizzes", "الاختبارات"], ["orders", "الطلبات والمدفوعات"],
  ["settings", "الإعدادات"],
] as const;
type Permission = { read: boolean; create: boolean; update: boolean; delete: boolean };
const readOnly = (): Record<string, Permission> => Object.fromEntries(SCOPES.map(([k]) => [k, { read: true, create: false, update: false, delete: false }]));

export default function AdminMcpSettings() {
  const [enabled, setEnabled] = useState(true);
  const saveEnabled = async (value: boolean) => { setEnabled(value); const { error } = await (supabase as any).from("mcp_settings").upsert({ key: "enabled", value: { enabled: value }, updated_at: new Date().toISOString() }); if (error) toast.error(error.message); };
  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<Record<string, Permission>>(readOnly());
  const [secret, setSecret] = useState("");
  const load = async () => { const { data } = await (supabase as any).from("mcp_api_keys").select("id,name,key_prefix,permissions,revoked_at,last_used_at,expires_at,created_at").order("created_at", { ascending: false }); setKeys(data ?? []); };
  useEffect(() => { load(); }, []);
  const createKey = async () => {
    if (!name.trim()) return toast.error("اكتب اسم المفتاح");
    const raw = `mcp_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const { data, error } = await (supabase as any).rpc("mcp_create_api_key", { p_name: name.trim(), p_secret: raw, p_permissions: permissions });
    if (error) return toast.error(error.message);
    setSecret(data?.secret ?? raw); setName(""); await load(); toast.success("تم إنشاء المفتاح. انسخه الآن؛ لن يظهر كاملًا مرة أخرى.");
  };
  const revoke = async (id: string) => { const { error } = await (supabase as any).from("mcp_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id); if (error) toast.error(error.message); else load(); };
  const toggle = (scope: string, action: keyof Permission, value: boolean) => setPermissions((p) => ({ ...p, [scope]: { ...p[scope], [action]: value } }));
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("تم النسخ"));
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;
  const prompt = `اربط خادم MCP التالي بأداة الذكاء الاصطناعي لديك:\nURL: ${endpoint}\nاستخدم OAuth 2.1 إن كان مدعومًا، وإلا استخدم Bearer API key من مدير الأسرار. ابدأ بـ initialize ثم tools/list. لا تنفذ أي تعديل أو حذف قبل عرض العملية وتأكيدها.`;
  return <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
    <div><h1 className="text-3xl font-bold">إعدادات MCP</h1><p className="text-muted-foreground mt-2">ربط Claude Code وCodex وManus وأي عميل MCP، بصلاحيات قابلة للتحكم.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />الخادم</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><span>تفعيل MCP</span><Switch checked={enabled} onCheckedChange={saveEnabled} /></div><div className="flex gap-2"><Input readOnly value={endpoint} dir="ltr" /><Button variant="outline" onClick={() => copy(endpoint)}><Copy className="w-4 h-4" /></Button></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" />مفاتيح API</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input placeholder="اسم المفتاح، مثل Claude الإنتاج" value={name} onChange={e => setName(e.target.value)} /><Button onClick={createKey}><Plus className="w-4 h-4 ml-1" />إنشاء</Button></div>{secret && <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3"><p className="text-sm mb-2">احفظه الآن فقط:</p><div className="flex gap-2"><Input readOnly value={secret} dir="ltr" /><Button variant="outline" onClick={() => copy(secret)}><Copy className="w-4 h-4" /></Button></div></div>}{keys.map(k => <div key={k.id} className="flex items-center justify-between border rounded-lg p-3"><div><b>{k.name}</b><div className="text-xs text-muted-foreground" dir="ltr">{k.key_prefix} · {k.revoked_at ? "revoked" : "active"}</div></div>{!k.revoked_at && <Button variant="destructive" size="sm" onClick={() => revoke(k.id)}><Trash2 className="w-4 h-4" /></Button>}</div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>صلاحيات المفتاح الجديد</CardTitle></CardHeader><CardContent className="space-y-3">{SCOPES.map(([key, label]) => <div key={key} className="grid grid-cols-5 gap-2 items-center text-sm"><span>{label}</span>{(["read", "create", "update", "delete"] as const).map(a => <label key={a} className="flex gap-1 items-center"><Switch checked={permissions[key][a]} onCheckedChange={v => toggle(key, a, v)} />{a}</label>)}</div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>تعليمات الربط والبرومبت الجاهز</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">أضف URL كخادم MCP. استخدم OAuth 2.1 عند توفره؛ API key يوضع في secret manager وليس داخل Git أو prompt عام.</p><pre className="rounded-md border bg-muted p-3 text-xs" dir="ltr">{`Claude Code / generic:\n  server URL: ${endpoint}\n  Authorization: Bearer <API_KEY>\\n\\nCodex / Manus / Zcode:\n  MCP transport: Streamable HTTP\n  endpoint: ${endpoint}`}</pre><textarea readOnly value={prompt} className="w-full min-h-32 rounded-md border bg-muted p-3 text-sm" dir="rtl" /><Button variant="outline" onClick={() => copy(prompt)}><Copy className="w-4 h-4 ml-1" />نسخ البرومبت</Button></CardContent></Card>
  </div>;
}
