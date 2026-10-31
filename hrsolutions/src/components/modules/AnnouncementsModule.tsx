'use client';

import React, { useState, useMemo } from 'react';
import {
  Pin,
  Search,
  Plus,
  Heart,
  ThumbsUp,
  PartyPopper,
  Rocket,
  Lightbulb,
  Flame,
  MessageSquare,
  Paperclip,
  Calendar,
  X,
  Send,
  Trash2,
  Download,
  Tag,
  FileText,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { Announcement } from '../../types';
import { api } from '../../services/apiClient';
import styles from './mobile-announcements.module.css';

interface AnnouncementsModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

// Map emoji identifiers to clean Lucide icons & labels (eliminating raw emoji glyphs)
const REACTION_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  '👍': { label: 'Like', icon: ThumbsUp },
  '❤️': { label: 'Love', icon: Heart },
  '🎉': { label: 'Celebrate', icon: PartyPopper },
  '🚀': { label: 'Launch', icon: Rocket },
  '💡': { label: 'Idea', icon: Lightbulb },
  '🔥': { label: 'Trending', icon: Flame },
};

const AVAILABLE_REACTION_KEYS = ['👍', '❤️', '🎉', '🚀', '💡', '🔥'];

export const AnnouncementsModule: React.FC<AnnouncementsModuleProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const currentPersona = state.currentPersona;
  // Must match backend requireRole on POST /audit-comms/announcements
  const isLeadershipOrHR =
    currentPersona.role === 'super_admin' ||
    currentPersona.role === 'hr_manager';

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'all' | 'pinned' | 'unread'>('all');

  // Drawer / Creation Modal
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<Announcement['category']>('Company');
  const [newPriority, setNewPriority] = useState<Announcement['priority']>('Normal');
  const [newDepartment, setNewDepartment] = useState('All Departments');
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [newTags, setNewTags] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; type: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const sizeStr = parseFloat(sizeMb) > 0 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;
    setAttachedFile({
      name: file.name,
      size: sizeStr,
      type: file.name.endsWith('.pdf') ? 'pdf' : 'doc',
    });
    setNewAttachmentName(file.name);
  };

  // Expandable Comments State
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const formatToDDMMYYYY = (dateInput?: string | Date): string => {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) return dateInput;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
      const parts = dateInput.split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const announcementsList = state.announcements || [];

  // Filtered Announcements
  const filteredAnnouncements = useMemo(() => {
    return announcementsList.filter((ann) => {
      // Tab filter
      if (activeTab === 'pinned' && !ann.pinned) return false;
      if (activeTab === 'unread' && ann.readBy.includes(currentPersona.id)) return false;

      // Category filter
      if (selectedCategory !== 'All' && ann.category !== selectedCategory) return false;

      // Priority filter
      if (selectedPriority !== 'All' && ann.priority !== selectedPriority) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = ann.title.toLowerCase().includes(q);
        const matchesContent = ann.content.toLowerCase().includes(q);
        const matchesAuthor = ann.authorName.toLowerCase().includes(q);
        const matchesTags = ann.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesContent && !matchesAuthor && !matchesTags) return false;
      }

      return true;
    }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [announcementsList, activeTab, selectedCategory, selectedPriority, searchQuery, currentPersona.id]);

  const pinnedBroadcasts = useMemo(() => {
    return announcementsList.filter((ann) => ann.pinned);
  }, [announcementsList]);

  const unreadCount = useMemo(() => {
    return announcementsList.filter((ann) => !ann.readBy.includes(currentPersona.id)).length;
  }, [announcementsList, currentPersona.id]);

  // Handle Mark as Read
  const handleMarkAsRead = async (announcementId: string) => {
    const ann = announcementsList.find((a) => a.id === announcementId);
    if (!ann || ann.readBy.includes(currentPersona.id)) return;

    try {
      await api.auditComms.markAnnouncementRead(announcementId, currentPersona.id);
      onUpdateState((prev) => ({
        ...prev,
        announcements: (prev.announcements || []).map((ann) => {
          if (ann.id === announcementId && !ann.readBy.includes(currentPersona.id)) {
            return { ...ann, readBy: [...ann.readBy, currentPersona.id] };
          }
          return ann;
        }),
      }));
    } catch (err) {
      console.error('Failed to mark announcement as read', err);
    }
  };

  // Handle Reaction Toggle
  const handleToggleReaction = async (announcementId: string, emojiKey: string) => {
    handleMarkAsRead(announcementId);

    setIsSaving(true);
    try {
      await api.auditComms.toggleReaction(announcementId, emojiKey, currentPersona.id);
      
      onUpdateState((prev) => ({
        ...prev,
        announcements: (prev.announcements || []).map((ann) => {
          if (ann.id !== announcementId) return ann;

          const existingReactionIndex = ann.reactions.findIndex((r) => r.emoji === emojiKey);
          let updatedReactions = [...ann.reactions];

          if (existingReactionIndex >= 0) {
            const rx = updatedReactions[existingReactionIndex];
            const hasReacted = rx.users.includes(currentPersona.id);

            if (hasReacted) {
              // Remove user reaction
              const newUsers = rx.users.filter((uid) => uid !== currentPersona.id);
              if (newUsers.length === 0) {
                updatedReactions = updatedReactions.filter((_, idx) => idx !== existingReactionIndex);
              } else {
                updatedReactions[existingReactionIndex] = {
                  ...rx,
                  count: rx.count - 1,
                  users: newUsers,
                };
              }
            } else {
              // Add user reaction
              updatedReactions[existingReactionIndex] = {
                ...rx,
                count: rx.count + 1,
                users: [...rx.users, currentPersona.id],
              };
            }
          } else {
            // Create new reaction
            updatedReactions.push({
              emoji: emojiKey,
              count: 1,
              users: [currentPersona.id],
            });
          }

          return { ...ann, reactions: updatedReactions };
        }),
      }));
    } catch (err) {
      console.error('Failed to toggle reaction', err);
      if (onTriggerToast) onTriggerToast('Failed to save reaction', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Add Comment
  const handleAddComment = async (announcementId: string) => {
    const text = commentInputs[announcementId]?.trim();
    if (!text) return;

    handleMarkAsRead(announcementId);

    setIsSaving(true);
    try {
      const newComment = {
        id: `comm_${Date.now()}`,
        authorName: currentPersona.name,
        authorAvatar: currentPersona.avatar,
        authorRole: currentPersona.designation,
        text,
        createdAt: 'Just now',
      };

      await api.auditComms.addComment(announcementId, newComment);

      onUpdateState((prev) => ({
        ...prev,
        announcements: (prev.announcements || []).map((ann) => {
          if (ann.id === announcementId) {
            return {
              ...ann,
              comments: [...ann.comments, newComment],
            };
          }
          return ann;
        }),
      }));

      setCommentInputs((prev) => ({ ...prev, [announcementId]: '' }));
      if (onTriggerToast) {
        onTriggerToast('Comment posted successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to post comment', err);
      if (onTriggerToast) onTriggerToast('Failed to post comment', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Pin Status (Admins/Leadership)
  const handleTogglePin = async (announcementId: string) => {
    setIsSaving(true);
    try {
      await api.auditComms.togglePin(announcementId);
      
      onUpdateState((prev) => ({
        ...prev,
        announcements: (prev.announcements || []).map((ann) => {
          if (ann.id === announcementId) {
            return { ...ann, pinned: !ann.pinned };
          }
          return ann;
        }),
      }));
    } catch (err) {
      console.error('Failed to toggle pin', err);
      if (onTriggerToast) onTriggerToast('Failed to pin announcement', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Announcement (Admins/Leadership)
  const handleDeleteAnnouncement = async (announcementId: string) => {
    setIsSaving(true);
    try {
      await api.auditComms.deleteAnnouncement(announcementId);
      
      onUpdateState((prev) => ({
        ...prev,
        announcements: (prev.announcements || []).filter((ann) => ann.id !== announcementId),
      }));
      if (onTriggerToast) {
        onTriggerToast('Announcement deleted', 'info');
      }
    } catch (err) {
      console.error('Failed to delete announcement', err);
      if (onTriggerToast) onTriggerToast('Failed to delete announcement', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Create Announcement Submit
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsSaving(true);
    try {
      // Direct synchronous backend API call
      const res = await api.auditComms.createAnnouncement({
        title: newTitle.trim(),
        content: newContent.trim(),
        authorEmployeeId: currentPersona.id,
        priority: ({ Normal: 'normal', Important: 'important', Critical: 'urgent' } as const)[newPriority],
        category: ({
          Company: 'GENERAL',
          'HR & Policy': 'HR_POLICY',
          Engineering: 'IT_ALERT',
          Celebration: 'EVENT',
          Urgent: 'IT_ALERT',
        } as const)[newCategory],
        pinToHeaderBanner: newIsPinned,
        tags: newTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });

      const parsedTags = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const newAnnouncement: Announcement = {
        id: res.data?.id || `ann_${Date.now()}`,
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        priority: newPriority,
        authorName: currentPersona.name,
        authorRole: currentPersona.designation,
        authorAvatar: currentPersona.avatar,
        date: new Date().toISOString().split('T')[0],
        pinned: newIsPinned,
        department: newDepartment,
        tags: parsedTags.length > 0 ? parsedTags : [newCategory],
        readBy: [currentPersona.id],
        reactions: [
          { emoji: '👍', count: 1, users: [currentPersona.id] },
        ],
        comments: [],
        attachments: (attachedFile || newAttachmentName.trim())
          ? [
              {
                name: attachedFile?.name || newAttachmentName.trim(),
                size: attachedFile?.size || '1.5 MB',
                type: (attachedFile?.type || (newAttachmentName.endsWith('.pdf') ? 'pdf' : 'doc')) as any,
              },
            ]
          : undefined,
      };

      onUpdateState((prev) => ({
        ...prev,
        announcements: [newAnnouncement, ...(prev.announcements || [])],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: `New Announcement: ${newAnnouncement.title}`,
            message: `${newAnnouncement.authorName} broadcasted: ${newAnnouncement.title}`,
            timestamp: 'Just now',
            category: 'System',
            read: false,
            linkModule: 'announcements',
          },
          ...prev.notifications,
        ],
      }));

      setShowCreateDrawer(false);
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      setNewAttachmentName('');
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNewIsPinned(false);

      if (onTriggerToast) {
        onTriggerToast('Announcement broadcasted successfully!', 'success');
      }
    } catch (err: any) {
      console.error('Failed to create announcement', err);
      const detail = err?.message || 'Unknown error';
      if (onTriggerToast) {
        onTriggerToast(`Failed to broadcast announcement: ${detail}`, 'warning');
      } else {
        alert(`Failed to broadcast announcement: ${detail}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Category Badge Colors adhering to DESIGN.md semantic palette
  const getCategoryBadgeColor = (category: Announcement['category']) => {
    if (category === 'Urgent') return 'people-studio__status people-studio__status--error';
    if (category === 'Celebration') return 'people-studio__status people-studio__status--ok';
    return 'people-studio__status people-studio__status--invite';
  };

  return (
    <div className={`people-studio announcements-page ${styles.page}`}>
      <div className="people-studio__head">
        <h1 className="people-studio__title">
          Announcements
          {unreadCount > 0 && (
            <span className="people-studio__status people-studio__status--invite">
              {unreadCount} unread
            </span>
          )}
        </h1>
        {isLeadershipOrHR && (
          <div className="people-studio__actions">
            <button type="button" onClick={() => setShowCreateDrawer(true)} className="people-studio__btn people-studio__btn--primary">
              <Plus className="h-3.5 w-3.5" />
              New announcement
            </button>
          </div>
        )}
      </div>

      <section className="people-studio__sheet people-studio__sheet--pad">
        <div className="people-studio__filters">
          <div className="people-studio__search">
            <Search className="people-studio__search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, author, or tag"
              aria-label="Search announcements"
            />
          </div>
          <div className="people-studio__controls">
            <div className="people-studio__seg" role="tablist" aria-label="Announcement filters">
              <button type="button" role="tab" aria-selected={activeTab === 'all'} className={activeTab === 'all' ? 'is-on' : ''} onClick={() => setActiveTab('all')}>
                All {announcementsList.length}
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'pinned'} className={activeTab === 'pinned' ? 'is-on' : ''} onClick={() => setActiveTab('pinned')}>
                Pinned {pinnedBroadcasts.length}
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'unread'} className={activeTab === 'unread' ? 'is-on' : ''} onClick={() => setActiveTab('unread')}>
                Unread {unreadCount}
              </button>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="people-studio__select"
            >
              <option value="All">All categories</option>
              <option value="Company">Company</option>
              <option value="HR & Policy">HR & Policy</option>
              <option value="Engineering">Engineering</option>
              <option value="Celebration">Celebration</option>
              <option value="Urgent">Urgent</option>
            </select>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              aria-label="Filter by priority"
              className="people-studio__select"
            >
              <option value="All">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="Important">Important</option>
              <option value="Normal">Normal</option>
            </select>
          </div>
        </div>
      </section>

      <div className="people-studio__feed">
        {filteredAnnouncements.length === 0 ? (
          <div className="people-studio__empty">
            No announcements match these filters. Clear a filter or search a different title.
          </div>
        ) : (
          filteredAnnouncements.map((ann) => {
            const isRead = ann.readBy.includes(currentPersona.id);
            const isCommentsOpen = !!expandedComments[ann.id];
            const currentCommentText = commentInputs[ann.id] || '';

            return (
              <article
                key={ann.id}
                onClick={() => handleMarkAsRead(ann.id)}
                className={`people-studio__sheet people-studio__post${!isRead ? ' is-unread' : ''}${ann.pinned ? ' is-pinned' : ''}`}
              >
                {/* Card Top Row: Author Identity + Badges + Actions */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${styles.postHeader}`}>
                  <div className="flex items-center gap-3">
                    {ann.authorAvatar ? (
                      <img
                        src={ann.authorAvatar}
                        alt={ann.authorName}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 person-avatar rounded-full font-semibold text-sm flex items-center justify-center shrink-0">
                        {ann.authorName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">
                          {ann.authorName}
                        </h4>
                        {ann.authorRole && <span className="text-slate-300 text-xs">•</span>}
                        <span className="text-xs font-semibold text-slate-500">
                          {ann.authorRole}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        {ann.date && <Calendar className="h-3 w-3" />}
                        <span className="font-mono">{formatToDDMMYYYY(ann.date)}</span>
                        {ann.department && (
                          <>
                            <span>•</span>
                            <span>{ann.department}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badges & Actions (Zero Dot Noise, Clean Typography) */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    {ann.pinned && (
                      <span className="people-studio__status people-studio__status--invite">Pinned</span>
                    )}

                    {ann.priority === 'Critical' && (
                      <span className="people-studio__status people-studio__status--error">Critical</span>
                    )}

                    <span className={getCategoryBadgeColor(ann.category)}>{ann.category}</span>

                    {/* Admin Actions */}
                    {isLeadershipOrHR && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(ann.id);
                          }}
                          title={ann.pinned ? 'Unpin' : 'Pin to top'}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 cursor-pointer transition-colors"
                        >
                          <Pin className={`h-3.5 w-3.5 ${ann.pinned ? 'fill-current text-blue-600' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAnnouncement(ann.id);
                          }}
                          title="Delete announcement"
                          className="people-studio__btn people-studio__btn--ghost people-studio__btn--compact"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="people-studio__post-title">{ann.title}</h3>
                  <p className="people-studio__post-body">{ann.content}</p>
                </div>

                {/* Attachments (if any) */}
                {ann.attachments && ann.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ann.attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:border-blue-500 transition-colors shadow-2xs"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({file.size})</span>
                        <Download className="h-3 w-3 text-slate-400 hover:text-blue-600 cursor-pointer ml-1" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {ann.tags && ann.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {ann.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer Controls: Reactions + Discussion Trigger */}
                <div className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 ${styles.postFooter}`}>
                  {/* Reaction Button Chips (Lucide Icons, No Emojis) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {AVAILABLE_REACTION_KEYS.map((emojiKey) => {
                      const rx = ann.reactions.find((r) => r.emoji === emojiKey);
                      const hasReacted = rx?.users.includes(currentPersona.id);
                      const config = REACTION_CONFIG[emojiKey] || { label: 'Like', icon: ThumbsUp };
                      const IconComponent = config.icon;

                      return (
                        <button
                          key={emojiKey}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReaction(ann.id, emojiKey);
                          }}
                          title={config.label}
                          className={`people-studio__react${hasReacted ? ' is-on' : ''}`}
                        >
                          <IconComponent className="h-3.5 w-3.5" />
                          {rx ? rx.count : 0}
                        </button>
                      );
                    })}
                  </div>

                  {/* Comment Trigger + Read Receipt */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedComments((prev) => ({
                          ...prev,
                          [ann.id]: !prev[ann.id],
                        }));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                      <span>
                        {ann.comments.length}{' '}
                        {ann.comments.length === 1 ? 'Comment' : 'Comments'}
                      </span>
                    </button>

                    {isRead ? (
                      <span className="people-studio__status people-studio__status--ok">Read</span>
                    ) : (
                      <span className="people-studio__status people-studio__status--invite">New</span>
                    )}
                  </div>
                </div>

                {/* 5. Expandable Comments Thread */}
                {isCommentsOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150"
                  >
                    {/* Existing Comments */}
                    {ann.comments.length > 0 && (
                      <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                        {ann.comments.map((comm) => (
                          <div
                            key={comm.id}
                            className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200"
                          >
                            {comm.authorAvatar ? (
                              <img
                                src={comm.authorAvatar}
                                alt={comm.authorName}
                                className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="h-7 w-7 person-avatar rounded-full font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                {comm.authorName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 space-y-0.5 text-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">
                                    {comm.authorName}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    • {comm.authorRole}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">{comm.createdAt}</span>
                              </div>
                              <p className="text-slate-700 leading-relaxed">
                                {comm.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New Comment Input */}
                    <div className="flex items-center gap-2 pt-1">
                      {currentPersona.avatar ? (
                        <img
                          src={currentPersona.avatar}
                          alt={currentPersona.name}
                          className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="h-7 w-7 person-avatar rounded-full font-semibold text-xs flex items-center justify-center shrink-0">
                          {currentPersona.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={currentCommentText}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [ann.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(ann.id);
                            }
                          }}
                          placeholder="Write a thought or congratulations..."
                          aria-label="Write a comment"
                          className="w-full h-9 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(ann.id)}
                          disabled={!currentCommentText.trim()}
                          aria-label="Send comment"
                          className="people-studio__search-clear"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {showCreateDrawer && (
        <div className="people-studio__drawer">
          <div role="dialog" aria-modal="true" aria-label="New announcement" className="people-studio__drawer-panel">
            <div className="people-studio__drawer-head">
              <h3 className="people-studio__post-title">New announcement</h3>
              <button
                type="button"
                onClick={() => setShowCreateDrawer(false)}
                className="people-studio__btn people-studio__btn--ghost"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateAnnouncement}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="people-studio__drawer-body custom-scrollbar">
                {/* Title */}
                <label className="people-studio__field">
                  Title
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Q4 town hall"
                    required
                  />
                </label>

                {/* Category & Priority */}
                <div className="people-studio__filters-grid">
                  <label className="people-studio__field">
                    Category
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                    >
                      <option value="Company">Company</option>
                      <option value="HR & Policy">HR & Policy</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Celebration">Celebration</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="people-studio__field">
                    Priority
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Important">Important</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </label>
                </div>

                {/* Target Department */}
                <div>
                  <label className="people-studio__field">
                    Audience
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                  >
                    <option value="All Departments">All Departments (Company-Wide)</option>
                    <option value="Engineering & Product">Engineering & Product</option>
                    <option value="HR & Operations">HR & Operations</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                  </select>
                  </label>
                </div>

                {/* Pinned Broadcast Checkbox */}
                <label className="people-studio__sheet people-studio__sheet--pad flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newIsPinned}
                      onChange={(e) => setNewIsPinned(e.target.checked)}
                    />
                    <span className="people-studio__role">Pin to the top of the feed</span>
                </label>

                {/* Content */}
                <label className="people-studio__field">
                  Message
                  <textarea
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="What should people know?"
                    required
                  />
                </label>

                {/* Tags */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Tags <span className="text-slate-400 font-normal">(comma-separated or click presets)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="e.g. Town Hall, Q4, Policy, Awards"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  {/* Preset Tag Chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Town Hall', 'Q4', 'Policy', 'Awards', 'Urgent', 'Student Notice', 'Events'].map((preset) => {
                      const activeTagsList = newTags.split(',').map((t) => t.trim()).filter(Boolean);
                      const isSelected = activeTagsList.includes(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setNewTags(activeTagsList.filter((t) => t !== preset).join(', '));
                            } else {
                              setNewTags(activeTagsList.concat(preset).join(', '));
                            }
                          }}
                          className={`people-studio__react${isSelected ? ' is-on' : ''}`}
                        >
                          <Tag className="h-3 w-3" />
                          <span>{preset}</span>
                          {isSelected && <X className="h-3 w-3 ml-0.5 hover:text-rose-200" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Attachment Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Attachment Document <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                  />

                  {attachedFile || newAttachmentName ? (
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {attachedFile?.name || newAttachmentName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {attachedFile?.size || '1.5 MB'} • Document Attached
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedFile(null);
                          setNewAttachmentName('');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="people-studio__btn people-studio__btn--ghost people-studio__btn--compact"
                        title="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="people-studio__empty"
                    >
                      Attach a PDF, DOCX, or image (up to 10MB)
                    </button>
                  )}
                </div>
              </div>

              <div className="people-studio__drawer-foot">
                <button
                  type="button"
                  onClick={() => setShowCreateDrawer(false)}
                  className="people-studio__btn people-studio__btn--secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="people-studio__btn people-studio__btn--primary">
                  {isSaving ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
