'use client';

import React, { useState, useMemo } from 'react';
import {
  Megaphone,
  Pin,
  Search,
  Filter,
  Plus,
  Heart,
  ThumbsUp,
  PartyPopper,
  Rocket,
  Lightbulb,
  Flame,
  MessageSquare,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  Building2,
  ShieldAlert,
  Award,
  Cpu,
  X,
  Send,
  Trash2,
  Download,
  ChevronDown,
  Upload,
  Tag,
  FileText,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { Announcement } from '../../types';
import { api } from '../../services/apiClient';

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
  const isLeadershipOrHR =
    currentPersona.role === 'super_admin' ||
    currentPersona.role === 'hr_manager' ||
    currentPersona.role === 'project_manager' ||
    currentPersona.designation.toLowerCase().includes('ceo') ||
    currentPersona.designation.toLowerCase().includes('hr') ||
    currentPersona.designation.toLowerCase().includes('vp') ||
    currentPersona.designation.toLowerCase().includes('director');

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
    });
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
        priority: (newPriority.toLowerCase() === 'high' ? 'important' : newPriority.toLowerCase() === 'urgent' ? 'urgent' : 'normal') as any,
      });

      if (!res.success && res.error) {
        alert(`Failed to broadcast announcement to backend: ${res.error.message}`);
        setIsSaving(false);
        return;
      }

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
    } catch (err) {
      console.error('Failed to create announcement', err);
      alert('Failed to broadcast announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  // Category Badge Colors adhering to DESIGN.md semantic palette
  const getCategoryBadgeColor = (category: Announcement['category']) => {
    switch (category) {
      case 'Company':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'HR & Policy':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Engineering':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Celebration':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Urgent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getCategoryIcon = (category: Announcement['category']) => {
    switch (category) {
      case 'Company':
        return <Building2 className="h-3.5 w-3.5 shrink-0" />;
      case 'HR & Policy':
        return <Award className="h-3.5 w-3.5 shrink-0" />;
      case 'Engineering':
        return <Cpu className="h-3.5 w-3.5 shrink-0" />;
      case 'Celebration':
        return <PartyPopper className="h-3.5 w-3.5 shrink-0" />;
      case 'Urgent':
        return <ShieldAlert className="h-3.5 w-3.5 shrink-0" />;
      default:
        return <Megaphone className="h-3.5 w-3.5 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* 1. Page Header Zone */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Announcements & Broadcasts
            </h1>
            {unreadCount > 0 && (
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Company-wide updates, policy broadcasts, and team milestone recognitions.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {isLeadershipOrHR && (
            <button
              onClick={() => setShowCreateDrawer(true)}
              className="h-10 flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-4 text-xs font-bold text-white transition-all cursor-pointer shadow-xs shadow-blue-600/20 active:scale-98"
            >
              <Plus className="h-4 w-4 stroke-[2.2]" />
              <span>New Announcement</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Featured / Pinned Alert Banner (Modern Corporate Blue Level 1 Surface) */}
      {pinnedBroadcasts.length > 0 && activeTab !== 'unread' && (
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 sm:p-6 shadow-sm space-y-4 relative overflow-hidden">
          {/* Top Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400" />

          {/* Header Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-2xs">
                <Pin className="h-3 w-3 fill-current" /> Pinned Broadcast
              </span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">
                {pinnedBroadcasts[0].category}
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-500 font-mono">
              {formatToDDMMYYYY(pinnedBroadcasts[0].date)}
            </span>
          </div>

          {/* Title & Body */}
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {pinnedBroadcasts[0].title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
              {pinnedBroadcasts[0].content}
            </p>
          </div>

          {/* Footer: Author + Reaction Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2.5">
              {pinnedBroadcasts[0].authorAvatar ? (
                <img
                  src={pinnedBroadcasts[0].authorAvatar}
                  alt={pinnedBroadcasts[0].authorName}
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                  {pinnedBroadcasts[0].authorName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-xs">
                <span className="font-semibold text-slate-900">
                  {pinnedBroadcasts[0].authorName}
                </span>
                <span className="text-slate-500 font-medium ml-1.5">
                  • {pinnedBroadcasts[0].authorRole}
                </span>
              </div>
            </div>

            {/* Quick Reactions using clean Lucide icons (No raw emoji glyphs) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {AVAILABLE_REACTION_KEYS.slice(0, 4).map((emojiKey) => {
                const rx = pinnedBroadcasts[0].reactions.find((r) => r.emoji === emojiKey);
                const hasReacted = rx?.users.includes(currentPersona.id);
                const config = REACTION_CONFIG[emojiKey] || { label: 'Like', icon: ThumbsUp };
                const IconComponent = config.icon;

                return (
                  <button
                    key={emojiKey}
                    type="button"
                    onClick={() => handleToggleReaction(pinnedBroadcasts[0].id, emojiKey)}
                    title={config.label}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      hasReacted
                        ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs font-bold'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <IconComponent
                      className={`h-3.5 w-3.5 ${
                        hasReacted ? 'text-blue-600 fill-blue-600/20' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-[11px] font-mono">{rx ? rx.count : 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements, tags, authors..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
          />
        </div>

        {/* Tabs & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({announcementsList.length})
            </button>
            <button
              onClick={() => setActiveTab('pinned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'pinned'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pinned ({pinnedBroadcasts.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'unread'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 appearance-none bg-white border border-slate-200 text-xs font-bold text-slate-700 pl-3 pr-8 rounded-xl outline-none cursor-pointer hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
            >
              <option value="All">All Categories</option>
              <option value="Company">Company</option>
              <option value="HR & Policy">HR & Policy</option>
              <option value="Engineering">Engineering</option>
              <option value="Celebration">Celebration</option>
              <option value="Urgent">Urgent</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Priority Dropdown */}
          <div className="relative">
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="h-10 appearance-none bg-white border border-slate-200 text-xs font-bold text-slate-700 pl-3 pr-8 rounded-xl outline-none cursor-pointer hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
            >
              <option value="All">All Priorities</option>
              <option value="Critical">Critical Priority</option>
              <option value="Important">Important</option>
              <option value="Normal">Normal</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 4. Announcements Feed List */}
      <div className="space-y-4">
        {filteredAnnouncements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3 shadow-2xs">
            <Megaphone className="h-10 w-10 text-slate-400 mx-auto stroke-[1.5]" />
            <h3 className="text-sm font-bold text-slate-900">
              No Announcements Found
            </h3>
            <p className="text-xs max-w-sm mx-auto text-slate-400">
              No broadcasts match your selected filters. Try changing your search query or category filter.
            </p>
          </div>
        ) : (
          filteredAnnouncements.map((ann) => {
            const isRead = ann.readBy.includes(currentPersona.id);
            const isCommentsOpen = !!expandedComments[ann.id];
            const currentCommentText = commentInputs[ann.id] || '';

            return (
              <div
                key={ann.id}
                onClick={() => handleMarkAsRead(ann.id)}
                className={`rounded-2xl border bg-white p-5 sm:p-6 transition-all space-y-4 shadow-2xs hover:border-slate-300 ${
                  !isRead
                    ? 'border-l-4 border-l-blue-600 border-slate-200'
                    : 'border-slate-200'
                }`}
              >
                {/* Card Top Row: Author Identity + Badges + Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ann.authorAvatar ? (
                      <img
                        src={ann.authorAvatar}
                        alt={ann.authorName}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
                        {ann.authorName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">
                          {ann.authorName}
                        </h4>
                        <span className="text-slate-300 text-xs">•</span>
                        <span className="text-xs font-semibold text-slate-500">
                          {ann.authorRole}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <Calendar className="h-3 w-3" />
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
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        <Pin className="h-3 w-3 fill-current" /> Pinned
                      </span>
                    )}

                    {ann.priority === 'Critical' && (
                      <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        <AlertTriangle className="h-3 w-3" /> Critical
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center gap-1 border text-[11px] font-bold px-2.5 py-0.5 rounded-md ${getCategoryBadgeColor(
                        ann.category
                      )}`}
                    >
                      {getCategoryIcon(ann.category)}
                      <span>{ann.category}</span>
                    </span>

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
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Title & Content */}
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                    {ann.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                    {ann.content}
                  </p>
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
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
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
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer active:scale-95 ${
                            hasReacted
                              ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs font-bold'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          <IconComponent
                            className={`h-3.5 w-3.5 ${
                              hasReacted ? 'text-blue-600 fill-blue-600/20' : 'text-slate-400'
                            }`}
                          />
                          <span className="text-[11px] font-mono">{rx ? rx.count : 0}</span>
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
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Read
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        NEW
                      </span>
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
                              <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
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
                        <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
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
                          className="w-full h-9 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(ann.id)}
                          disabled={!currentCommentText.trim()}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-600 disabled:text-slate-300 p-1 rounded-lg hover:bg-blue-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 6. Create Announcement Slide-Over Right Drawer (Mobile Responsive) */}
      {showCreateDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">New Announcement</h3>
                <p className="text-xs text-slate-500 mt-0.5 break-words">
                  Broadcast company news, policy updates, and team recognitions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateDrawer(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form
              onSubmit={handleCreateAnnouncement}
              className="flex-1 flex flex-col justify-between overflow-hidden bg-white"
            >
              <div className="p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar text-xs">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Announcement Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Q4 Town Hall & Executive Milestone Awards"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                    required
                  />
                </div>

                {/* Category & Priority */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 cursor-pointer transition-all"
                    >
                      <option value="Company">Company</option>
                      <option value="HR & Policy">HR & Policy</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Celebration">Celebration</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Priority Level
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 cursor-pointer transition-all"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Important">Important</option>
                      <option value="Critical">Critical Priority</option>
                    </select>
                  </div>
                </div>

                {/* Target Department */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Department / Audience
                  </label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 cursor-pointer transition-all"
                  >
                    <option value="All Departments">All Departments (Company-Wide)</option>
                    <option value="Engineering & Product">Engineering & Product</option>
                    <option value="HR & Operations">HR & Operations</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                  </select>
                </div>

                {/* Pinned Broadcast Checkbox */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newIsPinned}
                      onChange={(e) => setNewIsPinned(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Pin to Header Banner
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Feature this announcement at the top of the feed for maximum visibility.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Announcement Body Message <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Write detailed announcements, schedule, guidelines, or recognition..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all resize-none leading-relaxed"
                    required
                  />
                </div>

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
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/60'
                          }`}
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
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        title="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/30 rounded-xl p-4 text-center cursor-pointer transition-all group"
                    >
                      <Upload className="h-6 w-6 text-slate-400 group-hover:text-blue-600 mx-auto mb-1.5 transition-colors" />
                      <p className="text-xs font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                        Click to select document or drag & drop file
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        PDF, DOCX, PNG, JPG up to 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 sm:p-6 sm:px-8 border-t border-slate-100 flex items-center gap-3 bg-white shrink-0 pb-7 sm:pb-6">
                <button
                  type="button"
                  onClick={() => setShowCreateDrawer(false)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] flex items-center justify-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Publish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
