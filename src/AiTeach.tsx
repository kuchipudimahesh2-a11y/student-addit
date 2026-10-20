import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  Sparkles,
  Plus,
  Send,
  Paperclip,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
  FileCode,
  Layers,
  Copy,
  HelpCircle,
  BookOpen,
  ArrowRight,
  Menu,
  Loader2,
  Lightbulb,
} from 'lucide-react';
import { extractDocumentText, formatFileSize, type ExtractedDocument } from './utils/documentParser';
import './ai-teach.css';

interface User {
  id: string;
  name: string;
  username: string;
  gender: 'male' | 'female';
  avatarUrl?: string | null;
}

interface Session {
  id: string;
  user_id: string;
  title: string;
  document_name?: string | null;
  document_type?: string | null;
  document_size?: number;
  teaching_mode?: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  session_id?: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string | null;
  created_at: string;
}

interface Props {
  token: string;
  currentUser: User | null;
}

export function AiTeach({ token, currentUser }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [attachedDoc, setAttachedDoc] = useState<ExtractedDocument | null>(null);
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load user sessions
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/ai/teach/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] };
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load AI sessions:', err);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchSessions();
    }
  }, [token]);

  // Load session messages when currentSessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    const loadSessionMessages = async () => {
      try {
        const res = await fetch(`/api/ai/teach/sessions/${currentSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { session: Session; messages: ChatMessage[] };
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Failed to load session messages:', err);
      }
    };

    void loadSessionMessages();
  }, [currentSessionId, token]);

  // Auto-resize textarea
  const handleTextareaInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // Create a new session
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInputText('');
    setAttachedDoc(null);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Select a session
  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this study session?')) return;

    try {
      const res = await fetch(`/api/ai/teach/sessions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionId === id) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // Rename session
  const handleSaveTitle = async () => {
    if (!currentSessionId || !editTitleValue.trim()) {
      setIsEditingTitle(false);
      return;
    }

    try {
      const res = await fetch(`/api/ai/teach/sessions/${currentSessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitleValue.trim() }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { ...s, title: editTitleValue.trim() } : s))
        );
      }
    } catch (err) {
      console.error('Failed to update title:', err);
    } finally {
      setIsEditingTitle(false);
    }
  };

  // File upload & parsing
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingDoc(true);
    try {
      const doc = await extractDocumentText(file);
      setAttachedDoc(doc);
    } catch (err) {
      console.error('Failed to extract document text:', err);
      alert('Could not parse document. You can still ask questions or paste the text directly.');
    } finally {
      setIsExtractingDoc(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Send message
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || inputText).trim();
    if ((!promptToSend && !attachedDoc) || isLoading) return;

    const attachmentInfo = attachedDoc
      ? {
          fileName: attachedDoc.fileName,
          fileType: attachedDoc.fileType,
          fileSize: attachedDoc.fileSize,
          wordCount: attachedDoc.wordCount,
          pages: attachedDoc.pageOrSlideCount,
        }
      : undefined;

    const docContext = attachedDoc ? attachedDoc.text : undefined;

    // Optimistic user message
    const tempUserMsgId = `temp-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: promptToSend || `Teach me from "${attachedDoc?.fileName}" step-by-step.`,
      attachments: attachmentInfo ? JSON.stringify(attachmentInfo) : null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setAttachedDoc(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/teach/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: currentSessionId || undefined,
          message: promptToSend,
          documentContext: docContext,
          attachmentInfo,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        session: Session;
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
        error?: string;
      };

      if (res.ok && data.ok) {
        // If this was a new session, update active session and session list
        if (!currentSessionId && data.session) {
          setCurrentSessionId(data.session.id);
          setSessions((prev) => [data.session, ...prev]);
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsgId),
          data.userMessage,
          data.assistantMessage,
        ]);
      } else {
        const errorReply: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: data.error || 'I encountered an issue generating a response. Please try again.',
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorReply]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      const networkErrorReply: ChatMessage = {
        id: `net-err-${Date.now()}`,
        role: 'assistant',
        content: 'Network connection issue. Please check your internet connection and try again.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, networkErrorReply]);
    } finally {
      setIsLoading(false);
      void fetchSessions();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // Render markdown helper
  const renderFormattedContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const lang = lines[0].match(/^[a-z0-9_-]+$/i) ? lines[0] : '';
        const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
        const blockId = `${msgId}-code-${index}`;

        return (
          <div key={index} className="ai-code-block">
            <div className="ai-code-header">
              <span className="ai-code-lang">{lang || 'code'}</span>
              <button
                type="button"
                className="ai-code-copy-btn"
                onClick={() => copyToClipboard(code, blockId)}
              >
                {copiedCodeId === blockId ? (
                  <>
                    <Check size={14} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="ai-code-content">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Process regular markdown lines
      const lines = part.split('\n');
      return (
        <div key={index} className="ai-text-block">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} className="ai-paragraph-spacer" />;

            // H2
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={lIdx} className="ai-heading-2">
                  {trimmed.replace(/^##\s+/, '')}
                </h3>
              );
            }
            // H3
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="ai-heading-3">
                  {trimmed.replace(/^###\s+/, '')}
                </h4>
              );
            }
            // Bullet point
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <li key={lIdx} className="ai-list-item">
                  <span dangerouslySetInnerHTML={{ __html: formatBoldAndCode(trimmed.slice(2)) }} />
                </li>
              );
            }
            // Numbered list item
            if (/^\d+\.\s/.test(trimmed)) {
              return (
                <div key={lIdx} className="ai-step-item">
                  <span dangerouslySetInnerHTML={{ __html: formatBoldAndCode(trimmed) }} />
                </div>
              );
            }
            // Blockquote
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote key={lIdx} className="ai-blockquote">
                  {trimmed.replace(/^>\s*/, '')}
                </blockquote>
              );
            }

            return (
              <p
                key={lIdx}
                className="ai-paragraph"
                dangerouslySetInnerHTML={{ __html: formatBoldAndCode(trimmed) }}
              />
            );
          })}
        </div>
      );
    });
  };

  const formatBoldAndCode = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
  };

  return (
    <div className="ai-teach-container">
      {/* Sidebar for Sessions / History */}
      <aside className={`ai-teach-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="ai-sidebar-header">
          <button type="button" className="ai-new-chat-btn" onClick={handleNewChat}>
            <Plus size={18} />
            <span>New Study Chat</span>
          </button>
          <button
            type="button"
            className="ai-sidebar-close-btn"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="ai-sidebar-sessions">
          <div className="ai-sessions-label">Recent Study Sessions</div>
          {sessions.length === 0 ? (
            <div className="ai-sessions-empty">
              <span>No past sessions yet. Start a new chat to begin learning!</span>
            </div>
          ) : (
            <div className="ai-sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`ai-session-item ${session.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <div className="ai-session-icon">
                    {session.document_name ? <FileText size={16} /> : <BookOpen size={16} />}
                  </div>
                  <span className="ai-session-title" title={session.title}>
                    {session.title}
                  </span>
                  <button
                    type="button"
                    className="ai-session-delete-btn"
                    onClick={(e) => void handleDeleteSession(e, session.id)}
                    title="Delete session"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ai-sidebar-footer">
          <div className="ai-model-pill">
            <span className="ai-model-dot" />
            <span className="ai-model-name">Mistral NeMo • Step-by-Step</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="ai-teach-main">
        {/* Top Header */}
        <header className="ai-teach-header">
          <div className="ai-header-left">
            <button
              type="button"
              className="ai-sidebar-toggle-btn"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <Menu size={20} />
            </button>

            {isEditingTitle ? (
              <div className="ai-title-edit-box">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSaveTitle()}
                  autoFocus
                />
                <button type="button" onClick={() => void handleSaveTitle()}>
                  <Check size={16} />
                </button>
                <button type="button" onClick={() => setIsEditingTitle(false)}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="ai-header-title-wrap">
                <h2 className="ai-header-title">
                  {currentSession ? currentSession.title : 'AI Teach'}
                </h2>
                {currentSession && (
                  <button
                    type="button"
                    className="ai-title-pencil-btn"
                    onClick={() => {
                      setEditTitleValue(currentSession.title);
                      setIsEditingTitle(true);
                    }}
                    title="Rename session"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ai-header-right">
            <button type="button" className="ai-header-new-btn" onClick={handleNewChat}>
              <Plus size={16} />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Message Stream or Empty Welcome State */}
        <div className="ai-teach-messages-pane">
          {messages.length === 0 ? (
            <div className="ai-welcome-state">
              <div className="ai-welcome-badge">
                <Sparkles size={28} />
              </div>
              <h1 className="ai-welcome-title">What would you like to master today?</h1>
              <p className="ai-welcome-subtitle">
                Upload your lecture slides, textbook PDF, or notes, and I will break down each
                concept step-by-step with real-world examples.
              </p>

              <div className="ai-prompt-cards">
                <button
                  type="button"
                  className="ai-prompt-card"
                  onClick={() =>
                    void handleSendMessage(
                      'Teach me the fundamental concepts in my syllabus step-by-step with clear analogies.'
                    )
                  }
                >
                  <div className="ai-prompt-card-icon">
                    <BookOpen size={20} />
                  </div>
                  <div className="ai-prompt-card-text">
                    <strong>Teach me step-by-step</strong>
                    <span>Break down a topic into bite-sized concept stages</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="ai-prompt-card"
                  onClick={() =>
                    void handleSendMessage(
                      'Explain the most challenging formula or concept with an intuitive real-world analogy.'
                    )
                  }
                >
                  <div className="ai-prompt-card-icon">
                    <Lightbulb size={20} />
                  </div>
                  <div className="ai-prompt-card-text">
                    <strong>Intuitive Analogies</strong>
                    <span>Explain difficult topics without complicated jargon</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="ai-prompt-card"
                  onClick={() =>
                    void handleSendMessage(
                      'Quiz me on this chapter with 3 quick concept-check questions.'
                    )
                  }
                >
                  <div className="ai-prompt-card-icon">
                    <HelpCircle size={20} />
                  </div>
                  <div className="ai-prompt-card-text">
                    <strong>Quiz My Recall</strong>
                    <span>Test understanding with practice questions</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="ai-prompt-card"
                  onClick={() =>
                    void handleSendMessage(
                      'Create a revision summary cheat sheet highlighting key definitions and formulas.'
                    )
                  }
                >
                  <div className="ai-prompt-card-icon">
                    <FileText size={20} />
                  </div>
                  <div className="ai-prompt-card-text">
                    <strong>Revision Summary</strong>
                    <span>Generate high-yield key takeaways and formulas</span>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="ai-messages-list">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                let attachedInfo: any = null;
                if (msg.attachments) {
                  try {
                    attachedInfo = JSON.parse(msg.attachments);
                  } catch {}
                }

                return (
                  <div key={msg.id} className={`ai-message-row ${isUser ? 'user-row' : 'ai-row'}`}>
                    <div className="ai-message-avatar">
                      {isUser ? (
                        currentUser?.avatarUrl ? (
                          <img src={currentUser.avatarUrl} alt={currentUser.name} />
                        ) : (
                          <div className="ai-user-initial">
                            {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )
                      ) : (
                        <div className="ai-bot-avatar">
                          <Sparkles size={18} />
                        </div>
                      )}
                    </div>

                    <div className="ai-message-bubble">
                      {/* Attached Document Card (if attached to message) */}
                      {attachedInfo && (
                        <div className="ai-attached-doc-card">
                          <div className="ai-doc-card-icon">
                            {attachedInfo.fileName?.endsWith('.pdf') ? (
                              <FileText size={20} color="#ef4444" />
                            ) : attachedInfo.fileName?.match(/\.(pptx|ppt)$/i) ? (
                              <Layers size={20} color="#f59e0b" />
                            ) : attachedInfo.fileName?.match(/\.(docx|doc)$/i) ? (
                              <FileText size={20} color="#3b82f6" />
                            ) : (
                              <FileCode size={20} color="#10b981" />
                            )}
                          </div>
                          <div className="ai-doc-card-details">
                            <span className="ai-doc-card-name">{attachedInfo.fileName}</span>
                            <span className="ai-doc-card-meta">
                              {attachedInfo.fileSize
                                ? formatFileSize(attachedInfo.fileSize)
                                : 'Document'}{' '}
                              {attachedInfo.pages ? `• ${attachedInfo.pages} slides/pages` : ''}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Content */}
                      <div className="ai-message-content">
                        {isUser ? (
                          <p className="ai-user-text">{msg.content}</p>
                        ) : (
                          renderFormattedContent(msg.content, msg.id)
                        )}
                      </div>

                      {/* Interactive Next Steps on AI Messages */}
                      {!isUser && (
                        <div className="ai-message-actions">
                          <button
                            type="button"
                            className="ai-action-chip"
                            onClick={() => void handleSendMessage('Proceed to the next step')}
                          >
                            <ArrowRight size={13} />
                            <span>Next Step</span>
                          </button>

                          <button
                            type="button"
                            className="ai-action-chip"
                            onClick={() =>
                              void handleSendMessage(
                                'Explain that step simpler with an everyday analogy'
                              )
                            }
                          >
                            <Lightbulb size={13} />
                            <span>Explain Simpler</span>
                          </button>

                          <button
                            type="button"
                            className="ai-action-chip"
                            onClick={() =>
                              void handleSendMessage('Give me a practice problem on this step')
                            }
                          >
                            <HelpCircle size={13} />
                            <span>Practice Question</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="ai-message-row ai-row ai-loading-row">
                  <div className="ai-message-avatar">
                    <div className="ai-bot-avatar pulse">
                      <Sparkles size={18} />
                    </div>
                  </div>
                  <div className="ai-message-bubble ai-thinking-bubble">
                    <Loader2 size={16} className="ai-spin" />
                    <span>AI Teach is preparing your step-by-step lesson...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Input Composer */}
        <div className="ai-composer-container">
          {/* File Extracting Status Banner */}
          {isExtractingDoc && (
            <div className="ai-extracting-banner">
              <Loader2 size={14} className="ai-spin" />
              <span>Reading and extracting text from document...</span>
            </div>
          )}

          {/* Attached Document Preview Chip */}
          {attachedDoc && !isExtractingDoc && (
            <div className="ai-attached-preview">
              <div className="ai-preview-icon">
                {attachedDoc.fileName.endsWith('.pdf') ? (
                  <FileText size={16} color="#ef4444" />
                ) : attachedDoc.fileName.match(/\.(pptx|ppt)$/i) ? (
                  <Layers size={16} color="#f59e0b" />
                ) : (
                  <FileText size={16} color="#3b82f6" />
                )}
              </div>
              <div className="ai-preview-info">
                <span className="ai-preview-name">{attachedDoc.fileName}</span>
                <span className="ai-preview-meta">
                  {formatFileSize(attachedDoc.fileSize)} • Ready for AI tutoring
                </span>
              </div>
              <button
                type="button"
                className="ai-preview-remove"
                onClick={() => setAttachedDoc(null)}
                aria-label="Remove attachment"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div className="ai-input-capsule">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => void handleFileUpload(e)}
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.json"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="ai-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach PDF, PPT, Word Doc, or Text notes"
              disabled={isLoading || isExtractingDoc}
            >
              <Paperclip size={19} />
            </button>

            <textarea
              ref={textareaRef}
              className="ai-input-textarea"
              placeholder={
                attachedDoc
                  ? `Ask questions about "${attachedDoc.fileName}" or press send to teach step-by-step...`
                  : 'Ask anything, or attach a PDF/PPT/Doc to teach you step-by-step...'
              }
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />

            <button
              type="button"
              className={`ai-send-btn ${inputText.trim() || attachedDoc ? 'active' : ''}`}
              onClick={() => void handleSendMessage()}
              disabled={(!inputText.trim() && !attachedDoc) || isLoading}
              aria-label="Send message"
            >
              {isLoading ? <Loader2 size={18} className="ai-spin" /> : <Send size={18} />}
            </button>
          </div>

          <div className="ai-disclaimer">
            <span>
              AI Teach is powered by Mistral NeMo. Step-by-step learning mode is active.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
