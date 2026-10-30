import { Archive, Heart, LogOut } from "lucide-react";
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
import styles from "./AdoptionModal.module.css";

interface AdoptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (adoptedViaSite: boolean) => void;
  dogName: string;
  isSubmitting?: boolean;
}

export function AdoptionModal({
  isOpen,
  onClose,
  onConfirm,
  dogName,
  isSubmitting = false,
}: AdoptionModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isSubmitting && onClose()}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogIcon tone="neutral">
            <Archive />
          </DialogIcon>
          <DialogHeading>
            <DialogTitle>Arquivar {dogName}?</DialogTitle>
            <DialogDescription>
              Informe o motivo para manter as métricas atualizadas. O animal
              sairá da lista de disponíveis e poderá ser restaurado na página Arquivado.
            </DialogDescription>
          </DialogHeading>
        </DialogHeader>
        <DialogFooter className={styles.actionButtons}>
          <Button
            variant="success"
            leftIcon={<Heart size={20} aria-hidden="true" />}
            disabled={isSubmitting}
            onClick={() => onConfirm(true)}
          >
            {isSubmitting ? "Finalizando..." : "Adotado pelo site"}
          </Button>
          <Button
            variant="outline"
            leftIcon={<LogOut size={20} aria-hidden="true" />}
            disabled={isSubmitting}
            onClick={() => onConfirm(false)}
          >
            Adotado por fora ou outro motivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
