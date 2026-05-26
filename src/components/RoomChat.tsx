import { useState, useRef, useEffect, FormEvent } from 'react';
import { Send, MessageSquare, Terminal } from 'lucide-react';
import { Message } from '../types';

interface RoomChatProps {
  messages: Message[];
  currentUserId: string;
  socket: any;
}

export default function RoomChat({ messages, currentUserId, socket }: RoomChatProps) {
  const [text, setText] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMessageSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    socket.emit("chat-message", { text: text.trim() });
    setText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
      {/* Header section */}
      <div className="flex items-center gap-2 p-5 border-b border-white/10 shrink-0">
        <MessageSquare className="w-4 h-4 text-indigo-400" />
        <h4 className="text-sm font-semibold text-white">Чат комнаты</h4>
      </div>

      {/* Messages layout */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 Scrollbar-thin pr-3">
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div
                key={msg.id}
                className="flex items-center gap-2 py-1 px-3.5 bg-zinc-950/50 rounded-lg border border-white/5 text-[11px] font-sans text-amber-400 max-w-lg mx-auto"
              >
                <Terminal className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="flex-1 text-center font-medium leading-normal">{msg.text}</span>
                <span className="text-[9px] text-zinc-600 font-mono shrink-0">{msg.timestamp}</span>
              </div>
            );
          }

          const isMe = msg.senderId === currentUserId;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Profile Avatar */}
              <img
                src={msg.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.senderId}`}
                alt={msg.senderName}
                referrerPolicy="no-referrer"
                className="w-7.5 h-7.5 rounded-lg border border-white/5 bg-zinc-950"
              />

              <div className="flex flex-col gap-1">
                {/* Meta details */}
                <div className={`flex items-center gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {msg.senderName}
                  </span>
                  <span className="text-[8px] text-zinc-600 font-mono select-none">
                    {msg.timestamp}
                  </span>
                </div>

                {/* Text block */}
                <div
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-sans leading-relaxed break-all ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-600/10'
                      : 'bg-zinc-950/80 text-zinc-200 rounded-tl-none border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input section */}
      <form
        onSubmit={handleMessageSubmit}
        className="p-4 border-t border-white/5 bg-zinc-950/40 flex items-center gap-2.5 shrink-0"
      >
        <input
          type="text"
          placeholder="Напишите сообщение в чат..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-zinc-950 border border-white/5 rounded-xl py-2.5 px-4 text-xs font-sans text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/50 transition-all"
        />
        <button
          type="submit"
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer active:scale-95 shadow-md shadow-indigo-600/20"
          title="Отправить"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
