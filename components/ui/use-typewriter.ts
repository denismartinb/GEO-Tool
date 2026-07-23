import { useEffect, useRef, useState } from "react";

/** Cycles through `words`, typing and deleting each one, while `active`. */
export function useTypewriter(words: string[], active: boolean) {
  const [txt, setTxt] = useState("");
  const st = useRef({ w: 0, c: 0, del: false });
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = st.current;
      const word = words[s.w % words.length];
      if (!s.del) {
        s.c++;
        setTxt(word.slice(0, s.c));
        if (s.c >= word.length) {
          s.del = true;
          timer = setTimeout(tick, 1400);
          return;
        }
        timer = setTimeout(tick, 95);
      } else {
        s.c--;
        setTxt(word.slice(0, s.c));
        if (s.c <= 0) {
          s.del = false;
          s.w++;
          timer = setTimeout(tick, 280);
          return;
        }
        timer = setTimeout(tick, 45);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active, words]);
  return txt;
}
