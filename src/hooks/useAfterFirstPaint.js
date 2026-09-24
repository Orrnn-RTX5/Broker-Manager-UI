import { useEffect, useState } from 'react';

/**
 * False on the first render, true once the browser has painted it.
 * Lets a view paint its table and figures immediately and draw heavy
 * visuals (SVG maps, charts) in the task right after that first frame.
 */
export default function useAfterFirstPaint() {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let timer;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setPainted(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return painted;
}
