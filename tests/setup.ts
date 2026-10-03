// In-memory localStorage so the persisted store (and "survives a refresh" checks) work in Node.
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

// Node 22+ defines its own (file-backed, often unavailable) localStorage accessor;
// replace it outright rather than assigning over it.
for (const name of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
}

// zustand's persist middleware reads window.localStorage; give it a minimal window.
Object.defineProperty(globalThis, "window", {
  value: { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, location: { origin: "http://localhost" } },
  configurable: true,
  writable: true,
});
