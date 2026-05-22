import { create } from 'zustand'
import api from '../services/api'

export const useNotificationsStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true })
    try {
      const res = await api.get('/notifications/')
      const notifications = res.data || []
      const unreadCount = notifications.filter(n => !n.is_read).length
      set({ notifications, unreadCount, loading: false })
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
      set({ loading: false })
    }
  },

  markAsRead: async (notifId) => {
    try {
      await api.post(`/notifications/${notifId}/read`)
      const updatedList = get().notifications.map(n => 
        n.id === notifId ? { ...n, is_read: true } : n
      )
      const unreadCount = updatedList.filter(n => !n.is_read).length
      set({ notifications: updatedList, unreadCount })
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  },

  markAllRead: async () => {
    try {
      await api.post('/notifications/read-all')
      const updatedList = get().notifications.map(n => ({ ...n, is_read: true }))
      set({ notifications: updatedList, unreadCount: 0 })
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }
}))
