import { useState, useEffect, useRef, FormEvent, lazy, Suspense } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tv, 
  Sparkles, 
  Copy, 
  Check, 
  LogOut, 
  MonitorPlay, 
  Users, 
  Compass, 
  MessageSquare, 
  Shuffle, 
  Heart,
  ChevronRight,
  User,
  ShieldAlert
} from 'lucide-react';
import { Room, PlaybackState } from './types';
import LoadingScreen from './components/LoadingScreen';

// Lazy load heavy components for better mobile performance
const VideoPlayerContainer = lazy(() => import('./components/VideoPlayerContainer'));
const VideoSearcher = lazy(() => import('./components/VideoSearcher'));
const MembersList = lazy(() => import('./components/MembersList'));
const RoomChat = lazy(() => import('./components/RoomChat'));
const PlaylistQueue = lazy(() => import('./components/PlaylistQueue'));

// Persistent client identities
function getOrCreateUserId(): string {
  let id = sessionStorage.getItem('watch_party_user_id');
  if (!id) {
    id = 'usr_' + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('watch_party_user_id', id);
  }
  return id;
}

function getSavedUserName(): string {
  return localStorage.getItem('watch_party_user_name') || '';
}

function getSavedAvatarSeed(): string {
  return localStorage.getItem('watch_party_avatar_seed') || Math.random().toString(36).substring(7);
}

export default function App() {
  const [userId] = useState<string>(getOrCreateUserId);
  const [userName, setUserName] = useState<string>(getSavedUserName);
  const [avatarSeed, setAvatarSeed] = useState<string>(getSavedAvatarSeed);
  const [avatarUrl, setAvatarUrl] = useState<string>(`https://api.dicebear.com/7.x/bottts/svg?seed=${getSavedAvatarSeed()}`);
  
  const [roomId, setRoomId] = useState<string>('');
  const [activeRoomId, setActiveRoomId] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'playlist' | 'members'>('chat');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  
  // Backend health check state
  const [backendReady, setBackendReady] = useState<boolean>(false);
  const [backendCheckAttempts, setBackendCheckAttempts] = useState<number>(0);
  const [backendError, setBackendError] = useState<string>('');

  const socketRef = useRef<any>(null);

  // Backend health check on app load
  useEffect(() => {
    const checkBackendHealth = async () => {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      
      // Skip health check for localhost development
      if (backendUrl === 'http://localhost:3000' && window.location.hostname === 'localhost') {
        console.log('🏠 Running on localhost, skipping health check');
        setBackendReady(true);
        return;
      }

      console.log(`🏥 Health check attempt ${backendCheckAttempts + 1} to ${backendUrl}/api/health`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(`${backendUrl}/api/health`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Backend is ready:', data);
          setBackendReady(true);
          setBackendError('');
        } else {
          throw new Error(`Backend returned status ${response.status}`);
        }
      } catch (error: any) {
        console.error('❌ Backend health check failed:', error);
        
        const newAttempts = backendCheckAttempts + 1;
        setBackendCheckAttempts(newAttempts);
        
        if (newAttempts >= 10) {
          // After 10 attempts (about 80 seconds), give up
          setBackendError('Не удалось подключиться к серверу. Попробуйте обновить страницу через минуту.');
          setBackendReady(false);
        } else {
          // Retry after delay (exponential backoff: 3s, 5s, 8s, 10s...)
          const delay = Math.min(3000 + newAttempts * 2000, 10000);
          setTimeout(checkBackendHealth, delay);
        }
      }
    };

    checkBackendHealth();
  }, [backendCheckAttempts]);

  // Check URL query parameters for active invite code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteRoomId = params.get('room');
    if (inviteRoomId) {
      setRoomId(inviteRoomId);
    }
  }, []);

  // Update dynamic avatar avatar-url whenever seed changes
  useEffect(() => {
    setAvatarUrl(`https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`);
    localStorage.setItem('watch_party_avatar_seed', avatarSeed);
  }, [avatarSeed]);

  // Connect to active room room state via Socket.IO
  const connectToRoom = (targetRoomId: string) => {
    setIsConnecting(true);
    setConnectionError('');
    
    const finalUserName = userName.trim() || `Киноман #${Math.floor(Math.random() * 9000 + 1000)}`;
    localStorage.setItem('watch_party_user_name', finalUserName);

    // Dynamic address binding - use environment variable for backend URL or default to localhost
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    console.log('🔌 Connecting to backend:', backendUrl);
    
    const socket: Socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 15000, // Увеличено до 15 секунд
      reconnection: true,
      reconnectionAttempts: 10, // Увеличено до 10 попыток
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Максимальная задержка 5 секунд
      randomizationFactor: 0.5 // Рандомизация для избежания одновременных переподключений
    });

    socketRef.current = socket;
    setActiveRoomId(targetRoomId);

    // Функция для присоединения к комнате (используется при connect и reconnect)
    const joinRoom = () => {
      console.log('📡 Emitting join-room event for room:', targetRoomId);
      socket.emit('join-room', {
        roomId: targetRoomId,
        userName: finalUserName,
        userId: userId,
        userAvatar: avatarUrl
      });
    };

    // Первое подключение
    socket.on('connect', () => {
      console.log('✅ Socket connected! ID:', socket.id);
      setIsConnecting(false);
      setConnectionError('');
      joinRoom(); // Автоматически присоединяемся к комнате
    });

    // Попытка переподключения
    socket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
      setConnectionError(`Переподключение... (попытка ${attemptNumber}/10)`);
    });

    // Успешное переподключение
    socket.io.on('reconnect', (attemptNumber) => {
      console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      setConnectionError('');
      setIsConnecting(false);
      // joinRoom() будет вызван автоматически через событие 'connect'
    });

    // Ошибка переподключения
    socket.io.on('reconnect_error', (error) => {
      console.error('❌ Reconnection error:', error);
    });

    // Не удалось переподключиться после всех попыток
    socket.io.on('reconnect_failed', () => {
      console.error('❌ Reconnection failed after all attempts');
      setConnectionError('Потеряно соединение с сервером. Пожалуйста, обновите страницу.');
      setIsConnecting(false);
    });

    // Ошибка подключения
    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setIsConnecting(false);
      if (!socket.active) {
        // Socket не пытается переподключиться
        setConnectionError('Не удалось подключиться к серверу. Проверьте интернет или попробуйте позже.');
      }
    });

    // Отключение
    socket.on('disconnect', (reason) => {
      console.warn('⚠️ Socket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Сервер принудительно отключил - переподключаемся
        setConnectionError('Сервер разорвал соединение. Переподключение...');
        socket.connect();
      } else if (reason === 'io client disconnect') {
        // Клиент сам отключился - не переподключаемся
        console.log('Client disconnected intentionally');
      } else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') {
        // Проблемы с сетью - Socket.IO автоматически попытается переподключиться
        setConnectionError('Проблемы с соединением. Переподключение...');
      }
    });

    // Synchronize global Room status
    socket.on('room-status', (updatedRoom: Room) => {
      console.log('📥 Received room-status:', updatedRoom);
      setRoom(updatedRoom);
    });

    // Sync play/seek state changes instantly for UI widgets
    socket.on('playback-changed', (newPlaybackState: PlaybackState) => {
      setRoom((currentRoom) => {
        if (!currentRoom) return null;
        return {
          ...currentRoom,
          playbackState: newPlaybackState
        };
      });
    });

    // Direct chat channel update listener to optimize real-time feeds
    socket.on('message-received', (newMsg) => {
      setRoom((currentRoom) => {
        if (!currentRoom) return null;
        return {
          ...currentRoom,
          messages: [...currentRoom.messages, newMsg]
        };
      });
    });

    // Update state variables to match URL param syncs
    const url = new URL(window.location.href);
    url.searchParams.set('room', targetRoomId);
    window.history.pushState({}, '', url.toString());
  };

  const handleCreateRoom = () => {
    console.log('🎬 Creating room...');
    
    // Check if backend URL is configured
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    if (backendUrl === 'http://localhost:3000' && window.location.hostname !== 'localhost') {
      alert('⚠️ Backend не настроен! Пожалуйста, подождите пока сервер запустится (30-60 сек) или обновите страницу.');
      console.error('Backend URL not configured:', backendUrl);
      return;
    }
    
    // Generate simple descriptive room key
    const uniqueRoomCode = 'party-' + Math.random().toString(36).substring(2, 8);
    console.log('🎉 Room code generated:', uniqueRoomCode);
    connectToRoom(uniqueRoomCode);
  };

  const handleJoinByCode = (e: FormEvent) => {
    e.preventDefault();
    console.log('🚪 Joining room:', roomId);
    
    if (!roomId.trim()) {
      alert('⚠️ Введите ID комнаты!');
      return;
    }
    
    // Check if backend URL is configured
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    if (backendUrl === 'http://localhost:3000' && window.location.hostname !== 'localhost') {
      alert('⚠️ Backend не настроен! Пожалуйста, подождите пока сервер запустится (30-60 сек) или обновите страницу.');
      console.error('Backend URL not configured:', backendUrl);
      return;
    }
    
    connectToRoom(roomId.trim().toLowerCase());
  };

  const generateRandomSeed = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setAvatarSeed(newSeed);
  };

  const handleLeaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRoom(null);
    setActiveRoomId('');
    
    // Clear room query parameter fully from pathing variables
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());
  };

  const handleCopyLink = () => {
    const inviteLink = `${window.location.origin}?room=${activeRoomId}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLeader = room ? room.leaderId === userId : false;

  // Show loading screen while backend is not ready
  if (!backendReady) {
    return (
      <LoadingScreen 
        attempts={backendCheckAttempts} 
        error={backendError}
        onRetry={() => {
          setBackendCheckAttempts(0);
          setBackendError('');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {/* Decorative Background Lighting Bulbs */}
      <div className="absolute top-[-300px] left-[-200px] w-[600px] h-[600px] rounded-full bg-indigo-900/10 blur-[150px] pointer-events-none select-none" />
      <div className="absolute bottom-[-300px] right-[-200px] w-[600px] h-[600px] rounded-full bg-purple-900/5 blur-[150px] pointer-events-none select-none" />

      {/* Main Core View Switches */}
      <AnimatePresence mode="wait">
        {!activeRoomId || !room ? (
          // Welcome setup Screen Node
          <motion.div
            key="setup-screen"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 z-10"
          >
            <div className="w-full max-w-md flex flex-col items-center">
              {/* Launcher Header Branding */}
              <div className="flex items-center gap-3 mb-2 animate-fade-in">
                <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-xl shadow-indigo-600/20 glow-panel">
                  <Tv className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold font-display tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                    SYNC<span className="text-indigo-500">WATCH</span>
                  </h1>
                  <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest font-mono">
                    Синхронизация • КиноЧат
                  </p>
                </div>
              </div>

              <p className="text-center text-xs text-zinc-500 max-w-xs mb-8">
                Смотрите фильмы и ролики вместе с друзьями с идеальной секундной синхронизацией!
              </p>

              {/* Central card setup options */}
              <div className="w-full bg-[#0A0A0A]/90 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col gap-6 shadow-2xl relative">
                
                {/* Profile Configuration Section */}
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-display">
                    Шаг 1. Профиль Кинозрителя
                  </span>
                  
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                    {/* Generative Interactive BotAvatar block */}
                    <div className="relative shrink-0 group">
                      <img
                        src={avatarUrl}
                        alt="Пользовательский аватар"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-xl border border-white/10 bg-zinc-900 shadow-inner group-hover:border-indigo-500/30 transition-colors"
                      />
                      <button
                        onClick={generateRandomSeed}
                        className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-[#0A0A0A] border border-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer hover:scale-105"
                        title="Сгенерировать случайного робота"
                      >
                        <Shuffle className="w-3.5 h-3.5 animate-pulse" />
                      </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase leading-none">Ваше имя в чате</label>
                      <input
                        type="text"
                        placeholder="Киноман"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-sans font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Navigation Decision: Create room or join existing by room ID */}
                <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-display">
                    Шаг 2. Вход в Кинозал
                  </span>

                  {/* Connection error message */}
                  {connectionError && (
                    <div className="px-4 py-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{connectionError}</span>
                    </div>
                  )}

                  {/* Loading indicator */}
                  {isConnecting && (
                    <div className="px-4 py-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      <span>Подключение к серверу... Пожалуйста, подождите.</span>
                    </div>
                  )}

                  <button
                    onClick={handleCreateRoom}
                    disabled={isConnecting}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs transition-all active:scale-95 shadow-xl shadow-indigo-600/10 cursor-pointer flex items-center justify-center gap-2 group tracking-wide font-sans uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    {isConnecting ? 'Подключение...' : 'Создать новую комнату'}
                    {!isConnecting && <ChevronRight className="w-4 h-4 text-indigo-300 group-hover:translate-x-0.5 transition-transform" />}
                  </button>

                  <div className="flex items-center gap-3 my-1">
                    <div className="h-px bg-white/10 flex-1" />
                    <span className="text-[9px] font-mono text-zinc-600 uppercase font-bold">ИЛИ ПРИСОЕДИНИТЬСЯ ПО КОДУ</span>
                    <div className="h-px bg-white/10 flex-1" />
                  </div>

                  <form onSubmit={handleJoinByCode} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Вбейте ID комнаты (например: party-ab123)"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      disabled={isConnecting}
                      className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10 transition-all font-mono disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isConnecting}
                      className="px-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-200 hover:text-white text-xs font-semibold cursor-pointer active:scale-95 transition-all text-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConnecting ? '...' : 'Войти'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Footer info branding block */}
              <div className="flex items-center gap-1.5 mt-10 text-zinc-600 text-xs">
                <Heart className="w-3.5 h-3.5 text-zinc-700 hover:text-rose-500 transition-colors" />
                <span className="font-mono text-[10px]">SYNCWATCH Sync Engine 2026 v2.0</span>
              </div>
            </div>
          </motion.div>
        ) : (
          // Main Watch Party Screen Node
          <motion.div
            key="room-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            {/* Upper Room Header bar */}
            <header className="bg-[#0A0A0A] border-b border-white/10 px-3 md:px-8 py-3 shrink-0 backdrop-blur-md z-10 flex flex-row items-center justify-between gap-2">
              
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div onClick={handleLeaveRoom} className="p-2 rounded-lg bg-white/5 border border-white/10 text-indigo-400 hover:text-white cursor-pointer active:scale-95 transition-all shrink-0">
                  <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-[120px] sm:max-w-none">{room.name}</h2>
                    <span className="px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[8px] sm:text-[9px] uppercase font-bold border border-indigo-500/10 shrink-0">
                      {activeRoomId}
                    </span>
                    {/* Connection status indicator */}
                    {connectionError ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 shrink-0" title={connectionError}>
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                        <span className="hidden sm:inline text-[9px] text-yellow-400 font-mono">Переподключение...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0" title="Подключено">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="hidden md:inline text-[9px] text-emerald-400 font-mono">Онлайн</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 flex items-center gap-1 truncate max-w-[180px] sm:max-w-none">
                    <MonitorPlay className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate">"{room.videoTitle}"</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-2">
                {/* Invite copy-button details */}
                <button
                  onClick={handleCopyLink}
                  className="py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:bg-[#141414] text-xs text-zinc-305 hover:text-white font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  title="Скопировать ссылку"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 text-[11px] sm:text-xs">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline text-xs">Копировать ссылку</span>
                      <span className="inline sm:hidden text-[11px]">Инвайт</span>
                    </>
                  )}
                </button>

                {/* Exit button */}
                <button
                  onClick={handleLeaveRoom}
                  className="py-2 px-2.5 sm:py-2.5 sm:px-3.5 rounded-lg sm:rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 font-semibold text-xs active:scale-95 cursor-pointer transition-all border border-red-500/10 flex items-center gap-1 uppercase tracking-wide"
                  title="Выйти из кинозала"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Выйти</span>
                </button>
              </div>
            </header>

            {/* Room Content Workspace Grid Layout */}
            <main className="flex-1 p-3 md:p-6 lg:p-8 flex flex-col xl:grid xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto w-full overflow-y-auto xl:overflow-hidden select-none">
              
              {/* Player container - Row 1, Col 1-3 on Desktop | Top on Mobile */}
              <div className="xl:col-span-3 order-1 flex flex-col gap-4">
                <Suspense fallback={
                  <div className="w-full aspect-video bg-[#0A0A0A] border border-white/10 rounded-xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-zinc-400">Загрузка плеера...</p>
                    </div>
                  </div>
                }>
                  <VideoPlayerContainer
                    room={room}
                    isLeader={isLeader}
                    socket={socketRef.current}
                    playbackState={room.playbackState}
                  />
                </Suspense>
              </div>

              {/* Right Column (Sidebar Tabs) - Col 4, Row 1-2 on Desktop | Middle on Mobile */}
              <div className="w-full xl:col-span-1 xl:row-span-2 order-2 xl:h-[calc(100vh-140px)] flex flex-col gap-4 shrink-0 h-[480px] sm:h-[520px] xl:h-auto select-none overflow-hidden">
                
                {/* Tab switcher active for all layouts */}
                <div className="flex bg-[#0A0A0A] p-1.5 rounded-xl border border-white/10 shrink-0">
                  <button
                    onClick={() => setSidebarTab('chat')}
                    className={`flex-1 py-2 py-2.5 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${sidebarTab === 'chat' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Чат ({room.messages.filter(m => !m.isSystem).length})
                  </button>
                  <button
                    onClick={() => setSidebarTab('playlist')}
                    className={`flex-1 py-2 py-2.5 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${sidebarTab === 'playlist' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Copy className="w-3.5 h-3.5 rotate-90" />
                    Очередь ({room.playlist?.length || 0})
                  </button>
                  <button
                    onClick={() => setSidebarTab('members')}
                    className={`flex-1 py-2 py-2.5 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${sidebarTab === 'members' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Зрители ({room.members.length})
                  </button>
                </div>

                {/* Grid slot matching active sidebarTab */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <Suspense fallback={
                    <div className="flex-1 flex items-center justify-center bg-[#0A0A0A] border border-white/10 rounded-xl">
                      <div className="w-6 h-6 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  }>
                    {sidebarTab === 'chat' && (
                      <RoomChat
                        messages={room.messages}
                        currentUserId={userId}
                        socket={socketRef.current}
                      />
                    )}
                    {sidebarTab === 'playlist' && (
                      <PlaylistQueue
                        playlist={room.playlist || []}
                        isLeader={isLeader}
                        socket={socketRef.current}
                        currentUserId={userId}
                      />
                    )}
                    {sidebarTab === 'members' && (
                      <MembersList
                        members={room.members}
                        leaderId={room.leaderId}
                        currentUserId={userId}
                        socket={socketRef.current}
                      />
                    )}
                  </Suspense>
                </div>
              </div>

              {/* Search controller wrapper (Only leader can control, non-leader sees locked) - Row 1, Col 1-3 on Desktop | Bottom on Mobile */}
              <div className="xl:col-span-3 order-3 flex flex-col gap-4">
                <Suspense fallback={
                  <div className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex items-center justify-center">
                    <div className="w-6 h-6 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                }>
                  <VideoSearcher
                    isLeader={isLeader}
                    socket={socketRef.current}
                  />
                </Suspense>
              </div>

            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
