/**
 * Global UX behavior for numeric inputs across the app:
 *  - On focus: if value === "0" (or "0.00" etc.), clear the field so the user can type immediately.
 *  - On blur:  if the field is empty, reset the value back to "0" (preserving decimal formatting when detected).
 *
 * Applies to any <input type="number"> as well as <input inputmode="numeric|decimal">.
 * Opt-out per input with `data-no-auto-zero` attribute.
 */

function isNumericInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.dataset.noAutoZero !== undefined) return false;
  if (el.readOnly || el.disabled) return false;
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "number") return true;
  const inputMode = (el.getAttribute("inputmode") || "").toLowerCase();
  if (inputMode === "numeric" || inputMode === "decimal") return true;
  return false;
}

function isZeroLike(value: string): boolean {
  if (value === "") return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // Matches "0", "0.", "0.0", "0.00", "00", "-0", etc.
  return /^-?0+(?:[.,]0*)?$/.test(trimmed);
}

function setInputValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function onFocusIn(e: FocusEvent) {
  const target = e.target;
  if (!isNumericInput(target)) return;
  if (isZeroLike(target.value)) {
    // Remember decimal formatting hint so blur can restore matching zero.
    if (target.value.includes(".") || target.value.includes(",")) {
      target.dataset.autoZeroDecimal = String((target.value.split(/[.,]/)[1] || "").length);
    }
    setInputValue(target, "");
  }
}

function onFocusOut(e: FocusEvent) {
  const target = e.target;
  if (!isNumericInput(target)) return;
  if (target.value.trim() === "") {
    const decimals = Number(target.dataset.autoZeroDecimal || 0);
    const step = target.getAttribute("step") || "";
    let zero = "0";
    if (decimals > 0) {
      zero = (0).toFixed(decimals);
    } else if (step && step.includes(".")) {
      const stepDecimals = step.split(".")[1]?.length || 0;
      if (stepDecimals > 0) zero = (0).toFixed(stepDecimals);
    }
    setInputValue(target, zero);
    delete target.dataset.autoZeroDecimal;
  }
}

let installed = false;

export function installNumericInputBehavior() {
  if (installed) return;
  if (typeof document === "undefined") return;
  installed = true;
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
}
