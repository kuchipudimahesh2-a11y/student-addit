import React, { useEffect, useState, useRef } from 'react';
import { X, Reply, Image as ImageIcon, Mic, FileText, Gamepad2 } from 'lucide-react';
import './in-app-notification.css';

export type InAppNotificationData = {
  id: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  senderGender?: 'male' | 'female' | null;
  groupName?: string | null;
  chatKind: 'dm' | 'group';
  chatId: string;
  messageId?: string;
  body: string;
  mediaType?: 'image' | 'voice_note' | 'document' | 'video' | 'game' | null;
  mediaName?: string | null;
  timestamp?: string | number;
};

interface InAppNotificationBannerProps {
  notification: InAppNotificationData | null;
  onOpenChat: (kind: 'dm' | 'group', id: string, messageId?: string) => void;
  onDismiss: () => void;
}

export const InAppNotificationBanner: React.FC<InAppNotificationBannerProps> = ({
  notification,
  onOpenChat,
  onDismiss,
}) => {
  const [isDismissing, setIsDismissing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!notification) return;
    setIsDismissing(false);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, 4500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification?.id]);

  if (!notification) return null;

  const handleDismiss = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsDismissing(true);
    setTimeout(() => {
      onDismiss();
      setIsDismissing(false);
    }, 200);
  };

  const handleCardClick = () => {
    onOpenChat(notification.chatKind, notification.chatId, notification.messageId);
    onDismiss();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY < -24) {
        // Swiped up to dismiss
        handleDismiss();
      }
      touchStartY.current = null;
    }
  };

  const getMediaBadge = () => {
    switch (notification.mediaType) {
      case 'image':
        return (
          <span className="whatsapp-heads-up-media-badge">
            <ImageIcon size={13} /> Photo
          </span>
        );
      case 'voice_note':
        return (
          <span className="whatsapp-heads-up-media-badge">
            <Mic size={13} /> Voice message
          </span>
        );
      case 'document':
        return (
          <span className="whatsapp-heads-up-media-badge">
            <FileText size={13} /> {notification.mediaName || 'Document'}
          </span>
        );
      case 'game':
        return (
          <span className="whatsapp-heads-up-media-badge">
            <Gamepad2 size={13} /> Game Invite
          </span>
        );
      default:
        return null;
    }
  };

  const initial = notification.senderName ? notification.senderName.charAt(0).toUpperCase() : '?';

  return (
    <aside className="whatsapp-heads-up-container" aria-label="New Message Notification">
      <div
        className={`whatsapp-heads-up-card ${isDismissing ? 'dismissing' : ''}`}
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="alert"
      >
        <div className="whatsapp-heads-up-avatar-wrap">
          {notification.senderAvatarUrl ? (
            <img
              src={notification.senderAvatarUrl}
              alt={notification.senderName}
              className="whatsapp-heads-up-avatar"
            />
          ) : (
            <div className="whatsapp-heads-up-avatar">
              {initial}
            </div>
          )}
          <span className="whatsapp-heads-up-badge" />
        </div>

        <div className="whatsapp-heads-up-content">
          <div className="whatsapp-heads-up-header">
            <span className="whatsapp-heads-up-title">
              {notification.senderName}
              {notification.groupName && (
                <span className="whatsapp-heads-up-group-tag">@{notification.groupName}</span>
              )}
            </span>
            <span className="whatsapp-heads-up-time">now</span>
          </div>

          <div className="whatsapp-heads-up-body">
            {getMediaBadge()}
            {notification.body && <span>{notification.body}</span>}
            {!notification.body && !notification.mediaType && <span>Sent a message</span>}
          </div>
        </div>

        <div className="whatsapp-heads-up-actions">
          <button
            type="button"
            className="whatsapp-heads-up-reply-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            title="Reply to message"
          >
            <Reply size={12} />
            <span>Reply</span>
          </button>

          <button
            type="button"
            className="whatsapp-heads-up-dismiss-btn"
            onClick={handleDismiss}
            title="Dismiss notification"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>

        <div className="whatsapp-heads-up-progress-bar" />
      </div>
    </aside>
  );
};
