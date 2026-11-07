import { useMemo, useState } from "react";
import { Archive, Check, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationRow } from "@/lib/ai-api";

interface Props {
  items: ConversationRow[] | undefined;
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onUpdate: (id: string, patch: Partial<Pick<ConversationRow, "title" | "pinned" | "archived">>) => void;
}

function bucket(iso: string): string {
  const cairoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const today = cairoDay(new Date());
  const yesterday = cairoDay(new Date(Date.now() - 86_400_000));
  const day = cairoDay(new Date(iso));
  if (day === today) return "اليوم";
  if (day === yesterday) return "أمس";
  if (Date.now() - new Date(iso).getTime() < 7 * 86_400_000) return "آخر 7 أيام";
  return "أقدم";
}

const ORDER = ["مثبّتة", "اليوم", "أمس", "آخر 7 أيام", "أقدم"];

const ConversationList = ({ items, loading, activeId, onSelect, onNew, onUpdate }: Props) => {
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const groups = useMemo(() => {
    const filtered = (items ?? []).filter((c) => !q.trim() || (c.title ?? "").includes(q.trim()));
    const map = new Map<string, ConversationRow[]>();
    for (const c of filtered) {
      const key = c.pinned ? "مثبّتة" : bucket(c.updated_at);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [items, q]);

  const saveRename = () => {
    if (renaming && renaming.title.trim()) onUpdate(renaming.id, { title: renaming.title.trim().slice(0, 80) });
    setRenaming(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button className="w-full" onClick={onNew}>
          <Plus className="h-4 w-4" /> محادثة جديدة
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المحادثات" className="ps-9" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="المحادثات">
        {loading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{q ? "لا نتائج" : "لا توجد محادثات بعد"}</p>
        ) : (
          groups.map(([label, list]) => (
            <div key={label} className="mb-3">
              <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{label}</div>
              {list.map((c) => {
                const active = c.id === activeId;
                if (renaming?.id === c.id) {
                  return (
                    <div key={c.id} className="flex items-center gap-1 px-1 py-1">
                      <Input
                        autoFocus
                        value={renaming.title}
                        onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        className="h-8"
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveRename} aria-label="حفظ الاسم">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenaming(null)} aria-label="إلغاء">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                }
                return (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 rounded-lg pe-1 ${active ? "bg-secondary" : "hover:bg-secondary/60"}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className="min-w-0 flex-1 px-2 py-2 text-start"
                      aria-current={active ? "page" : undefined}
                    >
                      <div className="truncate text-sm">{c.title || "محادثة بدون عنوان"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(c.updated_at), { locale: ar, addSuffix: true })}
                      </div>
                    </button>
                    <DropdownMenu dir="rtl">
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label="خيارات المحادثة"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onUpdate(c.id, { pinned: !c.pinned })}>
                          {c.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          {c.pinned ? "إلغاء التثبيت" : "تثبيت"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRenaming({ id: c.id, title: c.title ?? "" })}>
                          <Pencil className="h-4 w-4" /> إعادة تسمية
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUpdate(c.id, { archived: true })}>
                          <Archive className="h-4 w-4" /> أرشفة
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </nav>
    </div>
  );
};

export default ConversationList;
