import { useEffect, useState } from "react";

export function useTypeIn(text: string, charsPerSecond = 45): { shown: string; done: boolean } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const id = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, 1000 / charsPerSecond);
    return () => window.clearInterval(id);
  }, [text, charsPerSecond]);

  return { shown: text.slice(0, count), done: count >= text.length };
}
