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
            category: ({
              GENERAL: 'Company',
              HR_POLICY: 'HR & Policy',
              EVENT: 'Celebration',
              ACADEMIC: 'Company',
              IT_ALERT: 'Engineering',
            } as Record<string, Announcement['category']>)[String(a.category || '').toUpperCase()] || 'Company',
            priority: ({
              normal: 'Normal',
              important: 'Important',
              urgent: 'Critical',
            } as Record<string, Announcement['priority']>)[String(a.priority || '').toLowerCase()] || 'Normal',
            authorName: a.author_name || 'System',
            authorRole: a.author_role || 'Admin',
            authorAvatar: a.author_avatar || '',
            date: a.created_at || new Date().toISOString(),
            pinned: Boolean(a.pin_to_header_banner),
            department: a.department_name,
            tags: Array.isArray(a.tags) ? a.tags : [],
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
            linkUrl: n.link_url,
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
