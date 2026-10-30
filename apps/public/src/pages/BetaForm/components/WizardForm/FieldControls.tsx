import * as React from "react";

import * as RadioComponent from "@jaci/ui/RadioGroup";
import * as SelectComponent from "@jaci/ui/Select";

import { useFieldContext } from "./FieldContext";
import styles from "./WizardForm.module.css";

export const FieldRadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioComponent.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof RadioComponent.RadioGroup>
>((props, ref) => {
  const { name, labelId, errorId, error } = useFieldContext();

  return (
    <RadioComponent.RadioGroup
      {...props}
      ref={ref}
      id={name}
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    />
  );
});

FieldRadioGroup.displayName = "FieldRadioGroup";

export const FieldSelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectComponent.SelectTrigger>,
  React.ComponentPropsWithoutRef<typeof SelectComponent.SelectTrigger>
>((props, ref) => {
  const { name, labelId, errorId, error } = useFieldContext();

  return (
    <SelectComponent.SelectTrigger
      {...props}
      className={[styles.selectTrigger, props.className].filter(Boolean).join(" ")}
      ref={ref}
      id={name}
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    />
  );
});

FieldSelectTrigger.displayName = "FieldSelectTrigger";
