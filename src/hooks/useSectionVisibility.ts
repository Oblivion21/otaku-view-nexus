import { useEffect, useRef, useState } from "react";

type UseSectionVisibilityOptions = {
  enabled?: boolean;
  once?: boolean;
  rootMargin?: string;
};

export function useSectionVisibility({
  enabled = true,
  once = true,
  rootMargin = "480px 0px",
}: UseSectionVisibilityOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(false);
      return;
    }

    if (isVisible && once) {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, isVisible, once, rootMargin]);

  return {
    ref,
    isVisible: enabled && isVisible,
  };
}
