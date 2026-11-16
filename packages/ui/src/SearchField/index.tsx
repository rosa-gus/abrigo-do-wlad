import * as React from "react";
import { Search, X } from "lucide-react";

import { Input, type InputProps } from "../Field";
import { cn } from "../utils";
import styles from "./SearchField.module.css";

export interface SearchFieldProps
  extends Omit<
    InputProps,
    "type" | "value" | "defaultValue" | "onChange"
  > {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onClear?: () => void;
  clearable?: boolean;
  clearLabel?: string;
  iconPlacement?: "inside" | "outside";
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    {
      value,
      defaultValue = "",
      onValueChange,
      onChange,
      onClear,
      clearable = true,
      clearLabel = "Limpar busca",
      iconPlacement = "inside",
      className,
      disabled,
      ...props
    },
    forwardedRef,
  ) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const currentValue = value ?? uncontrolledValue;

    React.useImperativeHandle(forwardedRef, () => innerRef.current!);

    function updateValue(nextValue: string) {
      if (value === undefined) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      updateValue(event.target.value);
      onChange?.(event);
    }

    function handleClear() {
      updateValue("");
      onClear?.();
      innerRef.current?.focus();
    }

    return (
      <div
        className={cn(styles.root, disabled && styles.disabled)}
        data-size={props.size ?? "md"}
        data-icon-placement={iconPlacement}
      >
        <Search className={styles.searchIcon} aria-hidden="true" />
        <Input
          {...props}
          ref={innerRef}
          type="search"
          value={currentValue}
          disabled={disabled}
          onChange={handleChange}
          className={cn(styles.input, className)}
        />
        {clearable && currentValue.length > 0 && !disabled && (
          <button
            type="button"
            className={styles.clearButton}
            aria-label={clearLabel}
            onClick={handleClear}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
