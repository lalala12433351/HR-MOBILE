import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { Announcement, NotificationItem } from '@/types';

export function useCommsData() {
  const [businessData, setBusinessData] = useState({
    announcements: [] as Announcement[],
    notifications: [] as NotificationItem[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [annRes, notifRes] = await Promise.all([
          api.auditComms.getAnnouncements().catch(() => ({ success: false, data: [] })),
          api.auditComms.getNotifications().catch(() => ({ success: false, data: [] }))
        ]);

        if (!isMounted) return;

        const newData = { ...businessData };

        if (annRes && annRes.success && Array.isArray(annRes.data)) {
          newData.announcements = annRes.data.map((a: any) => ({
            id: a.id,
            title: a.title,
            content: a.content || a.message || '',
            category: a.category || 'Company',
            priority: a.priority || 'Normal',
            authorName: a.author_name || 'System',
            authorRole: a.author_role || 'Admin',
            authorAvatar: a.author_avatar || '',
            date: a.created_at || new Date().toISOString(),
            pinned: a.pinned || false,
            department: a.department,
            tags: a.tags || [],
            readBy: a.read_by || [],
            reactions: a.reactions || [],
            comments: a.comments || []
          } as Announcement));
        }

        if (notifRes && notifRes.success && Array.isArray(notifRes.data)) {
          newData.notifications = notifRes.data.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message || '',
            timestamp: n.created_at || new Date().toISOString(),
            category: n.category || 'System',
            priority: n.priority || 'medium',
            read: n.is_read || false,
            linkModule: n.link_module,
            linkTab: n.link_tab,
            actorName: n.actor_name,
            actorAvatar: n.actor_avatar,
            actionLabel: n.action_label
          } as NotificationItem));
        }

        setBusinessData(newData);
      } catch (err) {
        console.error('Comms data fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateBusinessData = (updates: Partial<typeof businessData>) => {
    setBusinessData(prev => ({ ...prev, ...updates }));
  };

  return { businessData, updateBusinessData, loading };
}
