import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { Layers, Pencil, Trash2, ImageOff, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StageRow } from "./StageFormModal";

interface Props {
  stage: StageRow & { courses_count: number; order_index?: number };
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragging?: boolean;
  isDragTarget?: boolean;
}

const StageCard = ({
  stage,
  index,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragTarget,
}: Props) => {
  const signed = useSignedThumbnail(stage.thumbnail_url);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={`group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "opacity-40 scale-95 border-amber-500 border-dashed" : "opacity-100"
      } ${
        isDragTarget ? "border-amber-500 ring-2 ring-amber-500/20 scale-[1.02]" : "border-border/60 hover:shadow-xl hover:border-primary/40"
      }`}
    >
      <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-accent/50 to-primary/5 overflow-hidden">
        {/* Drag Handle Top-Left */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-background/90 backdrop-blur-sm text-foreground px-2 py-1 rounded-lg border border-border/50 shadow-sm opacity-90 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground">ترتيب #{index + 1}</span>
        </div>

        {signed ? (
          <img
            src={signed}
            alt={stage.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {stage.thumbnail_url ? (
              <div className="w-10 h-10 rounded-full border-2 border-current border-t-transparent animate-spin opacity-30" />
            ) : (
              <ImageOff className="w-10 h-10 opacity-40" />
            )}
          </div>
        )}
        <div className="absolute top-3 right-3 z-10">
          <Badge className="bg-background/90 text-foreground hover:bg-background border-0 shadow gap-1.5">
            <Layers className="w-3 h-3" />
            {stage.courses_count} دورات
          </Badge>
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-bold text-lg text-foreground mb-1 line-clamp-1">
          {stage.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {stage.description || "بدون وصف"}
        </p>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/60">
          {/* Move Up / Move Down buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isFirst}
              onClick={onMoveUp}
              title="تحريك لأعلى"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isLast}
              onClick={onMoveDown}
              title="تحريك لأسفل"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onEdit}
          >
            <Pencil className="w-4 h-4 ml-2" />
            تعديل
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StageCard;
