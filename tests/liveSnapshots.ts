// renderToString reads every useSyncExternalStore through its *server* snapshot,
// which for the zustand store is the initial state: a signed-in account would
// render as signed out. Tests that render pages for a signed-in account call
// this so the render sees the store as it is (as buyer-pages-render does).
import ReactCJS from "react";

type SES = typeof ReactCJS.useSyncExternalStore;

export function renderWithLiveSnapshots(): () => void {
  const react = ReactCJS as unknown as { useSyncExternalStore: SES };
  const orig = react.useSyncExternalStore;
  react.useSyncExternalStore = ((sub: Parameters<SES>[0], get: () => unknown) =>
    orig(sub, get, get)) as SES;
  return () => {
    react.useSyncExternalStore = orig;
  };
}
