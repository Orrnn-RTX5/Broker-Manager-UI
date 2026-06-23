import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

const getWindowControlsApi = () => (
  typeof window !== 'undefined' ? window.rtx5WindowControls : null
);

const stopWindowDragEvent = (event) => {
  event.stopPropagation();
};

const runWindowAction = (event, action) => {
  event.preventDefault();
  event.stopPropagation();
  action?.().catch?.((error) => {
    console.error('Desktop window control failed', error);
  });
};

const DesktopWindowControls = ({ variant = 'workspace' }) => {
  const [api] = useState(() => getWindowControlsApi());
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!api) return undefined;

    document.documentElement.classList.add('desktop-window-controls-enabled');

    let disposed = false;
    api.isMaximized?.()
      .then((value) => {
        if (!disposed) setIsMaximized(Boolean(value));
      })
      .catch(() => {});

    const unsubscribe = api.onMaximizedChange?.((nextIsMaximized) => {
      setIsMaximized(Boolean(nextIsMaximized));
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      document.documentElement.classList.remove('desktop-window-controls-enabled');
    };
  }, [api]);

  if (!api) return null;

  return (
    <>
      {variant === 'auth' && <div className="desktop-window-drag-strip" aria-hidden="true" />}
      <div className={`desktop-window-controls desktop-window-controls-${variant}`}>
        <button
          type="button"
          className="desktop-window-control"
          title="Minimize"
          aria-label="Minimize window"
          onPointerDown={stopWindowDragEvent}
          onClick={(event) => runWindowAction(event, api.minimize)}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-window-control"
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          onPointerDown={stopWindowDragEvent}
          onClick={(event) => runWindowAction(event, api.toggleMaximize)}
        >
          <Square size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-window-control desktop-window-control-close"
          title="Close"
          aria-label="Close window"
          onPointerDown={stopWindowDragEvent}
          onClick={(event) => runWindowAction(event, api.close)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
};

export default DesktopWindowControls;
