import { AlertTriangle, CheckCircle, CircleHelp } from "lucide-react";
import { Button } from "@jaci/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogIcon,
  DialogTitle,
} from "@jaci/ui/Dialog";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmingText?: string;
  isConfirming?: boolean;
  isDestructive?: boolean;
  tone?: "neutral" | "success" | "warning" | "danger";
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmingText = "Confirmando...",
  isConfirming = false,
  isDestructive = false,
  tone = "neutral",
}: ConfirmModalProps) {
  const resolvedTone = isDestructive ? "danger" : tone;
  const Icon = resolvedTone === "danger" || resolvedTone === "warning"
    ? AlertTriangle
    : resolvedTone === "success" ? CheckCircle : CircleHelp;
  const confirmVariant = resolvedTone === "danger" ? "danger"
    : resolvedTone === "success" ? "success" : "secondary";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isConfirming && onClose()}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogIcon tone={resolvedTone}>
            <Icon />
          </DialogIcon>
          <DialogHeading>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </DialogHeading>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={isConfirming} onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            disabled={isConfirming}
            onClick={onConfirm}
          >
            {isConfirming ? confirmingText : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
