import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseScopes } from "@/lib/mcp-oauth-scope";

const ACTIONS: Record<string, string> = { read: "قراءة", create: "إضافة", update: "تعديل", delete: "حذف" };
const RESOURCES: Record<string, string> = {
  users: "المستخدمون", courses: "الدورات", bundles: "الباقات", lessons: "الدروس",
  quizzes: "الاختبارات", orders: "الطلبات والمدفوعات", settings: "الإعدادات", "*": "كل الموارد",
};

const scopeLabel = (scope: string) => {
  const [action, resource] = scope.split(":");
  return `${ACTIONS[action] ?? action} ${RESOURCES[resource] ?? resource}`;
};

const redirectWithError = (redirectUri: string, error: string, state: string | null) => {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  window.location.replace(url.toString());
};

const McpAuthorize = () => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  const [clientName, setClientName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(false);

  const params = new URLSearchParams(location.search);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  const scope = params.get("scope") ?? "";
  const state = params.get("state");
  const authed = !loading && !!session;

  useEffect(() => {
    if (!authed || !clientId) return;
    (supabase as any)
      .from("mcp_oauth_clients")
      .select("client_name")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }: { data: { client_name: string } | null }) => {
        if (data) setClientName(data.client_name);
        else setInvalid(true);
      });
  }, [authed, clientId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl max-w-md w-full text-center space-y-4">
          <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-xl font-extrabold">مطلوب تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground">سجل دخول ثم عد لهذه الصفحة للمتابعة.</p>
          <Button asChild className="w-full font-bold">
            <Link to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}>تسجيل الدخول</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <p className="text-sm text-destructive">رابط تفويض غير صالح: معاملات ناقصة.</p>
        </div>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <p className="text-sm text-destructive">تطبيق غير معروف.</p>
        </div>
      </div>
    );
  }

  const approve = async () => {
    setApproving(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("no_session");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.code) throw new Error(data.error ?? "authorize_failed");
      const url = new URL(redirectUri);
      url.searchParams.set("code", data.code);
      if (state) url.searchParams.set("state", state);
      window.location.replace(url.toString());
    } catch {
      setError(true);
      setApproving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-xl font-extrabold">طلب تفويض MCP</h1>
          <p className="text-sm text-muted-foreground">
            التطبيق <span className="font-bold text-foreground">{clientName ?? clientId}</span> يطلب صلاحيات على حسابك.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-xs font-bold text-muted-foreground">الصلاحيات المطلوبة:</p>
          <ul className="space-y-1">
            {parseScopes(scope).map((s) => (
              <li key={s} className="text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {scopeLabel(s)}
                <span className="text-xs text-muted-foreground font-mono">({s})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3">
          <Button className="flex-1 font-bold" disabled={approving || !clientName} onClick={approve}>
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : "موافقة"}
          </Button>
          <Button
            variant="outline"
            className="flex-1 font-bold"
            disabled={approving}
            onClick={() => redirectWithError(redirectUri, "access_denied", state)}
          >
            رفض
          </Button>
        </div>
        {error && <p className="text-xs text-destructive text-center">تعذر إتمام التفويض، حاول مجدداً.</p>}

        <p className="text-xs text-muted-foreground text-center">
          المسجّل الدخول: {profile?.full_name ?? profile?.email ?? "حساب إداري"}
        </p>
      </div>
    </div>
  );
};

export default McpAuthorize;
