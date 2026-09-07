import React from 'react';
import useNotificationStore from '../store/notificationStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const Toast = ({ notification }) => {
  const { id, message, type } = notification;
  const remove = useNotificationStore((state) => state.removeNotification);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-blue-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  };

  const bgColors = {
    success: 'bg-blue-500/10 border-blue-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div
      className={twMerge(
        "flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg animate-in slide-in-from-right duration-300 pointer-events-auto min-w-[300px] max-w-md",
        bgColors[type] || bgColors.info
      )}
    >
      <div className="flex-shrink-0">{icons[type] || icons.info}</div>
      <div className="flex-1 text-sm font-medium text-gray-200">
        {message}
      </div>
      <button
        onClick={() => remove(id)}
        className="flex-shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4 text-gray-400 hover:text-white" />
      </button>
    </div>
  );
};

const ToastContainer = () => {
  const notifications = useNotificationStore((state) => state.notifications);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => (
        <Toast key={n.id} notification={n} />
      ))}
    </div>
  );
};

export default ToastContainer;
