import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Layers, Search, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import StageFormModal, { type StageRow } from "@/components/admin/StageFormModal";
import StageCard from "@/components/admin/StageCard";

type StageWithCount = StageRow & { courses_count: number };

const AdminStages = () => {
  const [stages, setStages] = useState<StageWithCount[] | null>(null);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StageRow | null>(null);
  const [deleting, setDeleting] = useState<StageWithCount | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("stages")
      .select("id, name, description, thumbnail_url, order_index, courses(id)")
      .order("order_index", { ascending: true });

    if (error) {
      toast.error("تعذّر تحميل المراحل");
      setStages([]);
      return;
    }
    setStages(
      (data ?? []).map((s: any, idx: number) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        thumbnail_url: s.thumbnail_url,
        order_index: s.order_index ?? idx,
        courses_count: s.courses?.length ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveOrder = async (newOrderedStages: StageWithCount[]) => {
    setStages(newOrderedStages);
    try {
      const updates = newOrderedStages.map((s, idx) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        thumbnail_url: s.thumbnail_url,
        order_index: idx,
      }));

      const { error } = await (supabase as any)
        .from("stages")
        .upsert(updates, { onConflict: "id" });

      if (error) throw error;
      toast.success("تم حفظ الترتيب الجديد للمراحل بنجاح");
    } catch (err: any) {
      console.error("Failed to save order:", err);
      toast.error("تعذّر حفظ الترتيب الجديد");
      load();
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragTargetIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex || !stages) return;

    const list = [...stages];
    const [removed] = list.splice(draggedIndex, 1);
    list.splice(dropIndex, 0, removed);

    setDraggedIndex(null);
    setDragTargetIndex(null);
    saveOrder(list);
  };

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (!stages || toIndex < 0 || toIndex >= stages.length) return;
    const list = [...stages];
    const [removed] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, removed);
    saveOrder(list);
  };

  const filtered = stages?.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (s: StageRow) => {
    setEditing(s);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (deleting.courses_count > 0) {
      toast.error(
        "لا يمكن حذف هذه المرحلة لأنها مرتبطة بدورات. يجب نقل أو حذف الدورات أولًا.",
      );
      setDeleting(null);
      return;
    }
    setDeletePending(true);
    try {
      if (deleting.thumbnail_url) {
        await supabase.storage
          .from("thumbnails")
          .remove([deleting.thumbnail_url]);
      }
      const { error } = await supabase
        .from("stages")
        .delete()
        .eq("id", deleting.id);
      if (error) throw error;
      toast.success("تم حذف المرحلة");
      setDeleting(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف المرحلة");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            المراحل الدراسية
          </h1>
          <p className="text-muted-foreground mt-2">
            نظّم دوراتك عبر مراحل تعليمية واضحة.
          </p>
        </div>
        <Button onClick={openAdd} size="lg" className="shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 ml-2" />
          إضافة مرحلة
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative mb-6 max-w-md"
      >
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث عن مرحلة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10"
        />
      </motion.div>

      {stages === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/60 overflow-hidden"
            >
              <Skeleton className="aspect-video w-full" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div>
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>يمكنك ترتيب المراحل الدراسية بالسحب والإفلات أو باستخدام الأسهم، وسيتم اعتماد هذا الترتيب تلقائيًا في الصفحة الرئيسية وجميع الفلاتر.</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((stage, i) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={i}
                isFirst={i === 0}
                isLast={i === filtered.length - 1}
                onEdit={() => openEdit(stage)}
                onDelete={() => setDeleting(stage)}
                onMoveUp={() => handleMove(i, i - 1)}
                onMoveDown={() => handleMove(i, i + 1)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={draggedIndex === i}
                isDragTarget={dragTargetIndex === i}
              />
            ))}
          </div>
        </div>
      ) : stages.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border-2 border-dashed border-border/70 bg-card/40 p-12 md:p-20 text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
            <Layers className="w-10 h-10 text-primary" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
            <Sparkles className="w-3 h-3" />
            ابدأ من هنا
          </div>
          <h2 className="text-2xl font-bold mb-2">لا توجد مراحل بعد</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            أضف أول مرحلة تعليمية لتصنيف دوراتك وتقديم تجربة منظمة لطلابك.
          </p>
          <Button onClick={openAdd} size="lg">
            <Plus className="w-4 h-4 ml-2" />
            إنشاء مرحلة جديدة
          </Button>
        </motion.div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          لا توجد نتائج مطابقة لبحثك.
        </div>
      )}

      <StageFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        stage={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              حذف المرحلة
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.courses_count > 0 ? (
                <>
                  لا يمكن حذف "{deleting.name}" لأنها مرتبطة بـ{" "}
                  <span className="font-semibold text-foreground">
                    {deleting.courses_count}
                  </span>{" "}
                  دورة. الرجاء نقل أو حذف الدورات المرتبطة بها أولًا.
                </>
              ) : (
                <>
                  هل أنت متأكد من حذف "{deleting?.name}"؟ لا يمكن التراجع عن
                  هذا الإجراء.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>إلغاء</AlertDialogCancel>
            {deleting && deleting.courses_count === 0 && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDelete();
                }}
                disabled={deletePending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                حذف نهائي
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminStages;
