import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

const WINDOW_STATE_CHANNEL = 'rtx5-window:state';

type WindowState = {
  isMaximized: boolean;
};

type WindowStateListener = (isMaximized: boolean) => void;

const invokeWindowAction = (channel: string): Promise<unknown> => ipcRenderer.invoke(channel);

contextBridge.exposeInMainWorld('rtx5WindowControls', {
  minimize: () => invokeWindowAction('rtx5-window:minimize'),
  toggleMaximize: () => invokeWindowAction('rtx5-window:toggle-maximize'),
  close: () => invokeWindowAction('rtx5-window:close'),
  isMaximized: () => ipcRenderer.invoke('rtx5-window:is-maximized'),
  onMaximizedChange: (callback: WindowStateListener) => {
    if (typeof callback !== 'function') return () => {};

    const listener = (_event: IpcRendererEvent, state: WindowState) => {
      callback(Boolean(state?.isMaximized));
    };

    ipcRenderer.on(WINDOW_STATE_CHANNEL, listener);
    return () => ipcRenderer.removeListener(WINDOW_STATE_CHANNEL, listener);
  },
});
