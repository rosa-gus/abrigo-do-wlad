import * as React from "react";
import { FieldContext } from "./FieldContext";
import type { FieldError } from "./useWizardForm";
import styles from "./WizardForm.module.css";

interface FieldWrapperProps {
  name: string;
  label: string;
  required?: boolean;
  errors: FieldError;
  children: React.ReactNode;
}

export function FieldWrapper({
  name,
  label,
  required = false,
  errors,
  children,
}: FieldWrapperProps) {
  const error = errors[name];
  const labelId = `${name}-label`;
  const errorId = `${name}-error`;

  return (
    <FieldContext.Provider value={{ name, labelId, errorId, error }}>
      <div
        className={`${styles.field} ${error ? styles.fieldError : ""}`}
        data-field-error={error ? true : undefined}
      >
        <label id={labelId} htmlFor={name}>
          {label} {required && <span className={styles.required}>*</span>}
        </label>
        {children}
        {error && (
          <span id={errorId} role="alert" className={styles.errorMessage}>
            {error}
          </span>
        )}
      </div>
    </FieldContext.Provider>
  );
}
