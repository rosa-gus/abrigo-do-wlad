import { useState } from "react";
import * as CardComponent from "@jaci/ui/Card";
import { Skeleton } from "@jaci/ui/Skeleton";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";
import styles from "./WizardForm.module.css";
import skeleton from "./WizardFormSkeleton.module.css";

function FieldSkeleton() {
  return (
    <div className={styles.field}>
      <Skeleton className={skeleton.label} />
      <Skeleton className={skeleton.input} />
    </div>
  );
}

export function WizardFormSkeleton() {
  const [showWarning] = useState(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_STORAGE_KEYS.showWarning);
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  return (
    <div
      className={styles.wizardContainer}
      role="status"
      aria-label="Carregando formulário de adoção"
      aria-busy="true"
    >
      <div aria-hidden="true" className={skeleton.content}>
        <div className={showWarning ? styles.warningHeader : styles.stepHeader}>
          {!showWarning && <Skeleton className={skeleton.stepCount} />}
          <Skeleton className={showWarning ? skeleton.introTitle : skeleton.stepTitle} />
          <Skeleton className={skeleton.description} />
          {!showWarning && <Skeleton className={skeleton.progress} />}
        </div>

        {showWarning ? (
          <>
            <div className={styles.warningProgress}>
              <Skeleton className={skeleton.stepCount} />
              <Skeleton className={skeleton.progress} />
            </div>
            <CardComponent.Card variant="callout" tone="muted" size="md" className={styles.warningCard}>
              <CardComponent.CardBody className={styles.warningCardBody}>
                <div className={styles.warningCardHeader}>
                  <Skeleton className={skeleton.cardTitle} />
                </div>
                <div className={styles.warningList}>
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className={skeleton.paragraph}>
                      <Skeleton className={skeleton.line} />
                      <Skeleton className={skeleton.shortLine} />
                    </div>
                  ))}
                </div>
              </CardComponent.CardBody>
            </CardComponent.Card>
          </>
        ) : (
          <div className={styles.stepContent}>
            <FieldSkeleton />
            <div className={styles.fieldRow}><FieldSkeleton /><FieldSkeleton /></div>
            <div className={styles.fieldRow}><FieldSkeleton /><FieldSkeleton /></div>
            <FieldSkeleton />
            <div className={styles.fieldRow}><FieldSkeleton /><FieldSkeleton /></div>
            <FieldSkeleton />
          </div>
        )}

        {showWarning ? (
          <div className={styles.warningActions}>
            <Skeleton className={`${skeleton.button} ${styles.warningExit}`} />
            <div className={styles.warningNavigation}>
              <Skeleton className={skeleton.button} />
            </div>
          </div>
        ) : (
          <div className={styles.navigation}>
            <div className={styles.navigationSpacer} />
            <Skeleton className={skeleton.button} />
          </div>
        )}
      </div>
    </div>
  );
}
