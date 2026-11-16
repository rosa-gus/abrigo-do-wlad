import { useEffect, useState, type FormEventHandler, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@jaci/ui/Button";
import { Card, CardBody, CardContent, CardHeader, CardIcon } from "@jaci/ui/Card";
import { ConfirmModal } from "../ConfirmModal";
import styles from "./FormShell.module.css";

interface FormShellProps {
  title: string;
  backTo: string;
  isDirty: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  submittingLabel?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  actions?: ReactNode;
  noValidate?: boolean;
}

interface FormSectionProps {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}

interface FormLayoutProps {
  children: ReactNode;
}

export function FormShell({
  title,
  backTo,
  isDirty,
  isSubmitting,
  submitLabel,
  submittingLabel = "Salvando...",
  onSubmit,
  children,
  actions,
  noValidate,
}: FormShellProps) {
  const navigate = useNavigate();
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const shouldProtectNavigation = isDirty;

  useEffect(() => {
    if (!shouldProtectNavigation) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldProtectNavigation]);

  useEffect(() => {
    if (!shouldProtectNavigation) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const currentDestination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextDestination = `${destination.pathname}${destination.search}${destination.hash}`;
      if (nextDestination === currentDestination) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingDestination(nextDestination);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [shouldProtectNavigation]);

  const requestBack = () => {
    if (shouldProtectNavigation) {
      setPendingDestination(backTo);
      return;
    }
    navigate(backTo);
  };

  const discardChanges = () => {
    if (!pendingDestination) return;
    const destination = pendingDestination;
    setPendingDestination(null);
    navigate(destination);
  };

  return (
    <div className={styles.container}>
      <ConfirmModal
        isOpen={pendingDestination !== null}
        onClose={() => setPendingDestination(null)}
        onConfirm={discardChanges}
        title="Descartar alterações?"
        message="As alterações feitas neste formulário ainda não foram salvas."
        confirmText="Descartar alterações"
        cancelText="Voltar a editar"
        confirmingText="Salvando..."
        isConfirming={isSubmitting}
        isDestructive
      />

      <div className={styles.headerArea}>
        <Button
          type="button"
          variant="text"
          leftIcon={<ArrowLeft size={20} />}
          onClick={requestBack}
          className={styles.backButton}
          disabled={isSubmitting}
        >
          Voltar
        </Button>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <form onSubmit={onSubmit} noValidate={noValidate} className={styles.formGrid}>
        {children}
        {actions ?? <Button
          type="submit"
          size="lg"
          className={styles.submitButton}
          leftIcon={isSubmitting ? undefined : <Save size={20} />}
          disabled={isSubmitting}
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>}
      </form>
    </div>
  );
}

export function FormSection({ icon, title, description, children }: FormSectionProps) {
  return (
    <Card className={styles.section} tone="muted" size="sm">
      <CardBody className={styles.sectionBody}>
        <CardHeader className={styles.sectionHeader}>
          <CardIcon className={styles.sectionIcon}>{icon}</CardIcon>
          <div className={styles.sectionHeading}>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </CardHeader>
        <CardContent className={styles.sectionContent}>{children}</CardContent>
      </CardBody>
    </Card>
  );
}

export function FormRow({ children }: FormLayoutProps) {
  return <div className={styles.row}>{children}</div>;
}
