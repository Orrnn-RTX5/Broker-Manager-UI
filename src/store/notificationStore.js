import { create } from 'zustand';

const useNotificationStore = create((set) => ({
  notifications: [],
  
  addNotification: (message, type = 'info', duration = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newNotification = { id, message, type };
    
    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duration);
    }
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

export default useNotificationStore;
