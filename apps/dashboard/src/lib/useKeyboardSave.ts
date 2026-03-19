import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

interface KeyboardSaveRegistration {
  enabled: () => boolean;
  handler: () => void;
}

interface KeyboardSaveContextValue {
  register: (registration: KeyboardSaveRegistration) => () => void;
}

const KeyboardSaveContext = createContext<KeyboardSaveContextValue | null>(null);

export function KeyboardSaveProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef<KeyboardSaveRegistration[]>([]);

  const register = useCallback((registration: KeyboardSaveRegistration) => {
    registrationsRef.current.push(registration);

    return () => {
      registrationsRef.current = registrationsRef.current.filter((entry) => entry !== registration);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;

      const registration = [...registrationsRef.current].reverse().find((entry) => entry.enabled());
      if (!registration) return;

      e.preventDefault();
      registration.handler();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return createElement(KeyboardSaveContext.Provider, { value }, children);
}

export function useKeyboardSave(handler: () => void, enabled = true) {
  const context = useContext(KeyboardSaveContext);
  const handlerRef = useRef(handler);
  const enabledRef = useRef(enabled);
  handlerRef.current = handler;
  enabledRef.current = enabled;

  useEffect(() => {
    if (!context) {
      if (!enabled) return;

      function onKey(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          handlerRef.current();
        }
      }

      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }

    return context.register({
      enabled: () => enabledRef.current,
      handler: () => handlerRef.current(),
    });
  }, [context, enabled]);
}
