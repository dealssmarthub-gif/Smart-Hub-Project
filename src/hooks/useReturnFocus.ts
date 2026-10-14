import { useLayoutEffect, useRef } from "react";

/**
 * Dialogs and sheets opened from a plain button (no Radix Trigger) lose focus to <body> when they
 * close. Remember what had focus when `open` turned true and hand it back on close: pass the
 * result to `onCloseAutoFocus` on DialogContent / SheetContent.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  // Layout effect: runs before Radix moves focus into the dialog (a passive effect).
  useLayoutEffect(() => {
    if (
      open &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      opener.current = document.activeElement;
    }
  }, [open]);
  return (e: Event) => {
    if (opener.current?.isConnected) {
      e.preventDefault();
      opener.current.focus();
    }
  };
}
