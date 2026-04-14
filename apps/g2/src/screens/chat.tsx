import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSessionStream } from '../hooks/use-session-stream';
import { useSessions } from '../hooks/use-sessions';
import { useModels } from '../hooks/use-models';
import { useSettings } from '../hooks/use-settings';
import { usePrompts } from '../hooks/use-prompts';
import { useSendPrompt, useCancelSession } from '../hooks/use-send-prompt';
import { useBridge } from '../contexts/bridge';
import { useTranslation } from '../hooks/useTranslation';
import { StatusDot } from '../components/shared/status-dot';
import { ChatBubble } from '../components/chat/chat-bubble';
import { ChatInput } from '../components/chat/chat-input';
import { CodeBlock } from '../components/chat/code-block';
import { ThinkingBlock } from '../components/chat/thinking-block';
import { ToolUseCard } from '../components/chat/tool-use-card';
import { Toolbar } from '../components/chat/toolbar';
import type { ChatMessage } from '../types';

/* ── Thinking label (cycles verbs like Claude Code) ── */

const THINKING_VERBS = [
  'Thinking', 'Reasoning', 'Pondering', 'Considering', 'Analyzing',
  'Processing', 'Evaluating', 'Reflecting', 'Examining', 'Working',
];

function ThinkingLabel() {
  const [verb, setVerb] = useState(() => THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]);

  useEffect(() => {
    const id = setInterval(() => {
      setVerb(THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-[13px] tracking-[-0.13px] text-text-dim italic font-normal">
      {verb}…
    </span>
  );
}

/* ── Provider color lookup ── */
function getProviderColor(tool?: string): string {
  const t = (tool ?? '').toLowerCase();
  if (t.includes('claude')) return '#C4704B';
  if (t.includes('codex')) return '#10A37F';
  if (t.includes('gemini')) return '#4285F4';
  return 'var(--color-accent)';
}

/* ── Content parser ── */
function renderContent(content: string, showToolDetails: boolean): ReactNode[] {
  if (!content.trim()) return [];

  const lines = content.split('\n');
  const elements: ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeLang = '';
  let key = 0;

  const flushCode = () => {
    if (codeLines.length > 0) {
      const text = codeLines.join('\n');
      const isDiff = codeLines.some((l) => l.startsWith('+') || l.startsWith('-') || l.startsWith('@@'));
      elements.push(<CodeBlock key={key++} code={text} language={codeLang || undefined} diff={isDiff} />);
      codeLines = [];
      codeLang = '';
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Tool use lines
    if (line.startsWith('>> ')) {
      const toolText = line.slice(3);
      const toolName = toolText.split(' ')[0] ?? 'tool';
      const toolInput = toolText.slice(toolName.length).trim();

      // AskUserQuestion: show the question as highlighted text, not a tool card
      if (toolName === 'AskUserQuestion' && toolInput) {
        elements.push(
          <div key={key++} className="text-[13px] tracking-[-0.13px] text-accent font-normal bg-surface rounded-[6px] px-3 py-2 my-1">
            {toolInput}
          </div>,
        );
        continue;
      }

      if (showToolDetails) {
        elements.push(
          <ToolUseCard key={key++} name={toolName} input={toolInput || undefined} status="done" />,
        );
      }
      continue;
    }

    // Error lines
    if (line.startsWith('! ')) {
      elements.push(
        <div key={key++} className="text-[13px] tracking-[-0.13px] text-negative">
          {line}
        </div>,
      );
      continue;
    }

    // Regular text
    if (line.trim()) {
      elements.push(
        <span key={key++}>
          {line}
          <br />
        </span>,
      );
    }
  }

  // Flush remaining code block
  if (inCode) {
    flushCode();
  }

  return elements;
}

/* ── Chat Screen ── */
export function ChatRoute() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('id') ?? '';
  const navigate = useNavigate();

  const { data: sessions } = useSessions();
  const messages = useSessionStream(sessionId, sessions);
  const { data: models } = useModels();
  const { data: settings } = useSettings();
  const { data: prompts } = usePrompts();
  const sendPrompt = useSendPrompt(sessions);
  const cancelSession = useCancelSession(sessions);
  const { ensureBridgeForSession } = useBridge();
  const { t } = useTranslation();

  const session = sessions?.find((s) => s.id === sessionId);
  const toolName = session?.tool ?? 'Session';
  const dirName = session?.workingDirectory?.split('/').pop() ?? '';
  const providerColor = getProviderColor(session?.tool);
  const isRunning = session?.status === 'running';

  // Detect if Claude is waiting for user reply
  // When session is idle and last assistant message ends with a question
  const lastMsg = messages[messages.length - 1];
  const lastContent = lastMsg?.content ?? '';
  const isPendingReply = !isRunning && session?.status === 'idle' && lastMsg?.role === 'assistant' &&
    messages.length > 1 && lastContent.trim().endsWith('?');

  const [input, setInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [selectedMode, setSelectedMode] = useState('auto');
  const [selectedModel, setSelectedModel] = useState(session?.model ?? '');
  const messagesRef = useRef<HTMLDivElement>(null);

  // Model options filtered by tool
  const toolModels: Record<string, { id: string; label: string }[]> = {
    claude: [
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'haiku', label: 'Haiku' },
    ],
    codex: (models?.filter(m => !m.hidden) ?? []).map(m => ({ id: m.id, label: m.displayName })),
    gemini: [
      { id: 'gemini-2.5-pro', label: '2.5 Pro' },
      { id: 'gemini-2.5-flash', label: '2.5 Flash' },
    ],
  };
  const modelItems = toolModels[session?.tool ?? 'claude'] ?? toolModels.claude;
  const modeItems = [
    { id: 'auto', label: 'Auto' },
    { id: 'code', label: 'Code' },
    { id: 'plan', label: 'Plan' },
    { id: 'chat', label: 'Chat' },
  ];

  // Context percentage estimate (based on message count)
  const contextPercent = messages.length > 0 ? Math.min(Math.round((messages.length / 100) * 100), 99) : 0;

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  // Optimistic user messages: shown immediately before stream delivers them
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);

  // Clear pending msg when stream delivers a user message
  useEffect(() => {
    if (pendingUserMsg && messages.some((m) => m.role === 'user' && m.content.includes(pendingUserMsg.slice(0, 30)))) {
      setPendingUserMsg(null);
    }
  }, [messages, pendingUserMsg]);

  const doSend = useCallback(() => {
    const text = input.trim();
    if (!text || !sessionId) return;
    setInput('');
    setPendingUserMsg(text);
    const opts: any = { sessionId, prompt: text };
    if (selectedMode !== 'auto') opts.mode = selectedMode;
    if (selectedModel && selectedModel !== session?.model) opts.model = selectedModel;
    sendPrompt.mutate(opts);
  }, [input, sessionId, sendPrompt, selectedMode, selectedModel, session?.model]);

  const handleCancel = useCallback(() => {
    if (sessionId) cancelSession.mutate(sessionId);
  }, [sessionId, cancelSession]);

  const handlePromptSelect = (prompt: string) => {
    sendPrompt.mutate({ sessionId, prompt });
    setShowPromptPicker(false);
  };

  const showToolDetails = settings?.showToolDetails ?? true;

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* ── Header ── */}
      <div className="shrink-0 px-3 py-2 flex items-center gap-3">
        <StatusDot status={session?.status ?? 'idle'} />
        <span className="data-mono uppercase">{toolName}</span>
        <span className="data-mono flex-1 truncate">~/{dirName}</span>
        {session?.model && (
          <span className="data-mono">{session.model}</span>
        )}
        {contextPercent > 0 && (
          <span className="data-mono">{contextPercent}%</span>
        )}
      </div>
      <div className="h-[2px] shrink-0" style={{ background: providerColor }} />

      {/* ── Pending reply banner ── */}
      {isPendingReply && (
        <div className="shrink-0 px-3 py-2 bg-[var(--color-accent-warning)] flex items-center gap-3 border-b border-border">
          <span className="text-[13px] tracking-[-0.13px] text-text flex-1">
            Waiting for your reply
          </span>
        </div>
      )}

      {/* ── Messages ── */}
      <div
        ref={messagesRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="text-[24px] tracking-[-0.72px] opacity-30">{'\u{1F4AC}'}</div>
            <div className="text-text-dim text-[13px] tracking-[-0.13px] mt-2">
              {t('output.waiting') ?? 'Waiting for output...'}
            </div>
          </div>
        ) : (
          messages.map((msg: ChatMessage, i: number) => (
            <ChatBubble
              key={i}
              role={msg.role}
              tool={toolName}
              timestamp={msg.timestamp}
            >
              {msg.thinking && <ThinkingBlock text={msg.thinking} />}
              {renderContent(msg.content, showToolDetails)}
            </ChatBubble>
          ))
        )}

        {/* Optimistic user message — shown immediately before stream delivers it */}
        {pendingUserMsg && !messages.some((m) => m.role === 'user' && m.content.includes(pendingUserMsg.slice(0, 30))) && (
          <ChatBubble role="user" tool={toolName}>
            {pendingUserMsg}
          </ChatBubble>
        )}

        {/* Thinking indicator — shows immediately on send, hides when assistant responds */}
        {(pendingUserMsg || (isRunning && messages.length > 0 && messages[messages.length - 1]?.role === 'user')) && (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="text-accent text-[15px] tracking-[-0.15px] status-breathe">✽</span>
            <ThinkingLabel />
          </div>
        )}

        {/* No "Generating" indicator — assistant content is visible as it streams */}
      </div>

      {/* ── Prompt picker overlay ── */}
      {showPromptPicker && prompts && prompts.length > 0 && (
        <div className="shrink-0 px-3 pb-1">
          <div className="bg-surface border border-border rounded-[6px] p-2 flex flex-col gap-1.5">
            {prompts.map((p) => (
              <div
                key={p.id}
                className="px-3 py-2 rounded-[6px] cursor-pointer hover:bg-bg text-[13px] tracking-[-0.13px] text-text card-hover"
                onClick={() => handlePromptSelect(p.prompt)}
              >
                <span className="font-normal">{p.label}</span>
                <span className="text-text-dim text-[11px] tracking-[-0.11px] ml-1.5">
                  {p.prompt.slice(0, 40)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <Toolbar
        mode={selectedMode}
        onModeChange={setSelectedMode}
        model={selectedModel || session?.model || ''}
        onModelChange={setSelectedModel}
        modes={modeItems}
        models={modelItems}
      />

      {/* ── Input ── */}
      <div className="shrink-0 px-3 pb-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={doSend}
          onVoiceStart={() => {}}
          onVoiceStop={isRunning ? handleCancel : undefined}
          isListening={false}
          isRunning={isRunning}
          placeholder={t('web.sendMessage') ?? 'Type a message...'}
        />
      </div>
    </div>
  );
}
