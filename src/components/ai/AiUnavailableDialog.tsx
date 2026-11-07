import { CloudOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Shown when the platform AI quota is exhausted or the plan expired.
 * Shared by the admin chat (Phase 6) and the storefront widget (Phase 8).
 */
const AiUnavailableDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent dir="rtl" className="sm:max-w-md">
      <div className="mx-auto mb-1 w-fit rounded-full bg-muted p-3">
        <CloudOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <AlertDialogHeader className="sm:text-center">
        <AlertDialogTitle className="text-center">المساعد الذكي غير متاح</AlertDialogTitle>
        <AlertDialogDescription className="text-center">
          خدمة المحادثة الذكية غير متاحة حالياً. يرجى المحاولة لاحقاً.
        </AlertDialogDescription>
        <p className="text-center text-xs text-muted-foreground" dir="ltr">
          AI chat is currently unavailable. Please try again later.
        </p>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:justify-center">
        <AlertDialogAction>حسناً</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default AiUnavailableDialog;
