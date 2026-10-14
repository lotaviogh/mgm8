import type { ParamStatus } from "@/engine";

export interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  hint?: string;
  status?: ParamStatus;
  wide?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
}

function Label({
  id,
  label,
  hint,
  status,
}: Pick<FieldProps, "id" | "label" | "hint" | "status">) {
  return (
    <label className="row-label" htmlFor={id}>
      {label}
      {status === "a_confirmar" ? <span className="needs-check">a confirmar</span> : null}
      {hint ? (
        <span className="row-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Uma linha do formulário: rótulo e dica à esquerda, valor e unidade à direita. */
export function Field({
  id,
  label,
  value,
  onChange,
  unit,
  hint,
  status,
  wide,
  inputMode = "decimal",
}: FieldProps) {
  return (
    <div className="row">
      <Label id={id} label={label} hint={hint} status={status} />
      <div className="ctl" style={wide ? { gridColumn: "1 / -1" } : undefined}>
        <input
          id={id}
          className={wide ? "input input-wide" : "input"}
          value={value}
          inputMode={inputMode}
          autoComplete="off"
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}

/** Linha do formulário com lista de opções. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  hint,
}: SelectFieldProps<T>) {
  return (
    <div className="row">
      <Label id={id} label={label} hint={hint} />
      <div className="ctl">
        <select
          id={id}
          className="select"
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
