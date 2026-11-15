import { create } from "zustand";

const MAX_ITEMS = 50;

// unreadCount - activity (group messages, private messages, calls, group
//               changes) the user has not looked at on the Notifications page.
// privateUnread - unread 1-on-1 messages as reported by Stream Chat.
export const useNotificationStore = create((set) => ({
  items: [],
  unreadCount: 0,
  privateUnread: 0,

  add: (item) =>
    set((state) => {
      if (item.id && state.items.some((i) => i.id === item.id)) return state;
      const entry = { id: `${Date.now()}-${Math.random()}`, createdAt: Date.now(), ...item };
      return {
        items: [entry, ...state.items].slice(0, MAX_ITEMS),
        unreadCount: state.unreadCount + 1,
      };
    }),

  // Kept for older callers.
  increment: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

  markAllRead: () => set({ unreadCount: 0 }),
  clearItems: () => set({ items: [], unreadCount: 0 }),
  setPrivateUnread: (n) => set({ privateUnread: Math.max(0, Number(n) || 0) }),
  reset: () => set({ items: [], unreadCount: 0, privateUnread: 0 }),
}));
