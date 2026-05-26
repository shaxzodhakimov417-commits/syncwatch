import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import YouTubePlayer from './YouTubePlayer';
import { PlaybackState, Room } from '../types';
import { Play, Pause, RotateCw, Volume2, ShieldAlert } from 'lucide-react';

interface VideoPlayerContainerProps {
  room: Room;
  isLeader: boolean;
  socket: any;
  playbackState: PlaybackState;
}

export default function VideoPlayerContainer({
  room,
  isLeader,
  socket,
  playbackState
}: VideoPlayerContainerProps) {
  const { videoSource, videoId, videoTitle, videoUrl } = room;
  const [hudTime, setHudTime] = useState<number>(playbackState.currentTime);
  const [showStatusIndicator, setShowStatusIndicator] = useState<boolean>(false);
  const [iframeUrl, setIframeUrl] = useState<string>('');
  
  // Floating reactions pool state
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const lastSyncedStateRef = useRef<{ videoId: string; playing: boolean; currentTime: number }>({
    videoId: '',
    playing: false,
    currentTime: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isRemoteDirectActionRef = useRef<boolean>(false);

  // Sync HUD state with incoming playbackState adjustments
  useEffect(() => {
    setHudTime(playbackState.currentTime);
    setShowStatusIndicator(true);
    const timer = setTimeout(() => setShowStatusIndicator(false), 2000);
    return () => clearTimeout(timer);
  }, [playbackState.playing, playbackState.currentTime]);

  // Run a visual tick on the timeline HUD if currently playing and not YouTube/HTML5 direct
  useEffect(() => {
    if (videoSource === 'youtube' || videoSource === 'direct') return;
    if (!playbackState.playing) return;

    const interval = setInterval(() => {
      setHudTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [playbackState.playing, videoSource]);

  // Sync Floating reactions live from sockets
  useEffect(() => {
    if (!socket) return;
    const handleRemoteReaction = (data: { id: string; emoji: string; userName: string }) => {
      const xPercent = Math.floor(Math.random() * 80) + 10;
      setFloatingReactions(prev => [
        ...prev,
        { id: data.id, emoji: data.emoji, x: xPercent }
      ]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== data.id));
      }, 3000);
    };

    socket.on("reaction-floating", handleRemoteReaction);
    return () => {
      socket.off("reaction-floating", handleRemoteReaction);
    };
  }, [socket]);

  // ————————————————————————————————————————————————————————————————————————
  // Direct Video HTML5 Sync Engine with chronologically precise initial seeking
  // ————————————————————————————————————————————————————————————————————————
  useEffect(() => {
    if (videoSource !== 'direct' || !videoRef.current) return;

    const video = videoRef.current;

    const syncHTML5Player = () => {
      isRemoteDirectActionRef.current = true;
      
      if (playbackState.playing) {
        if (video.paused) {
          video.play().catch(() => {});
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }

      // Compute elapsed time offset since leader last synced the playback state to handle fresh joinees correctly
      const elapsedOffset = (!isLeader && playbackState.playing && playbackState.lastUpdated)
        ? (Date.now() - playbackState.lastUpdated) / 1000
        : 0;
      const targetTime = Math.max(0, playbackState.currentTime + elapsedOffset);

      const drift = Math.abs(video.currentTime - targetTime);
      if (drift > 1.5) {
        video.currentTime = targetTime;
      }

      setTimeout(() => {
        isRemoteDirectActionRef.current = false;
      }, 500);
    };

    syncHTML5Player();

    if (!socket) return;
    const handleRemoteDirectChange = (newState: PlaybackState) => {
      if (isLeader) return;
      isRemoteDirectActionRef.current = true;
      
      if (newState.playing) {
        if (video.paused) video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
      }

      const elapsedOffset = (newState.playing && newState.lastUpdated)
        ? (Date.now() - newState.lastUpdated) / 1000
        : 0;
      const targetTime = Math.max(0, newState.currentTime + elapsedOffset);

      const drift = Math.abs(video.currentTime - targetTime);
      if (drift > 1.5) {
        video.currentTime = targetTime;
      }

      setTimeout(() => {
        isRemoteDirectActionRef.current = false;
      }, 500);
    };

    socket.on("playback-changed", handleRemoteDirectChange);

    return () => {
      socket.off("playback-changed", handleRemoteDirectChange);
    };
  }, [playbackState, videoSource, videoUrl, socket, isLeader]);

  // Periodic alignment heartbeat from leader to followers (Direct player only)
  useEffect(() => {
    if (videoSource !== 'direct' || !isLeader || !socket) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        socket.emit("sync-video", {
          playing: true,
          currentTime: video.currentTime
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videoSource, isLeader, socket]);

  // Handle direct player interaction events for Leader
  const handleDirectPlay = () => {
    if (!isLeader || isRemoteDirectActionRef.current) return;
    socket.emit("sync-video", {
      playing: true,
      currentTime: videoRef.current?.currentTime || 0
    });
  };

  const handleDirectPause = () => {
    if (!isLeader || isRemoteDirectActionRef.current) return;
    socket.emit("sync-video", {
      playing: false,
      currentTime: videoRef.current?.currentTime || 0
    });
  };

  const handleDirectSeeked = () => {
    if (!isLeader || isRemoteDirectActionRef.current) return;
    socket.emit("sync-video", {
      playing: !videoRef.current?.paused,
      currentTime: videoRef.current?.currentTime || 0
    });
  };

  // Restrict follower changes and force restore sync configuration
  const handleFollowerActionCheck = () => {
    if (isLeader || isRemoteDirectActionRef.current) return;
    const video = videoRef.current;
    if (video) {
        isRemoteDirectActionRef.current = true;
        
        const elapsedOffset = (playbackState.playing && playbackState.lastUpdated)
          ? (Date.now() - playbackState.lastUpdated) / 1000
          : 0;
        const targetTime = Math.max(0, playbackState.currentTime + elapsedOffset);

        if (playbackState.playing) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        video.currentTime = targetTime;
        setTimeout(() => {
          isRemoteDirectActionRef.current = false;
        }, 500);
    }
  };

  // Local tick update for HUD Scrubber
  const handleDirectTimeUpdate = () => {
    if (videoRef.current) {
      setHudTime(videoRef.current.currentTime);
    }
  };

  // ————————————————————————————————————————————————————————————————————————
  // VK / RuTube Iframe Embed Sync Engine with automatic chronological estimation
  // ————————————————————————————————————————————————————————————————————————
  useEffect(() => {
    if (videoSource === 'youtube' || videoSource === 'direct') return;

    const isNewVideo = videoId !== lastSyncedStateRef.current.videoId;
    const isPlayStateChanged = playbackState.playing !== lastSyncedStateRef.current.playing;
    const drift = Math.abs(playbackState.currentTime - lastSyncedStateRef.current.currentTime);
    const isManualSeek = drift > 5;

    // Compute base target timestamp with elapsed offsets if joining or switching screens late
    const elapsedOffset = (!isLeader && playbackState.playing && playbackState.lastUpdated)
      ? (Date.now() - playbackState.lastUpdated) / 1000
      : 0;
    const baseTime = Math.max(0, playbackState.currentTime + elapsedOffset);

    if (isNewVideo || !iframeUrl) {
      // Re-construct the accurate URL containing the required autoplay option and start-time stamp
      lastSyncedStateRef.current = {
        videoId,
        playing: playbackState.playing,
        currentTime: playbackState.currentTime
      };

      if (videoSource === 'vk') {
        let oid = "";
        let id = "";
        let hash = "";

        if (videoId && videoId.includes('_')) {
          const parts = videoId.split('_');
          oid = parts[0];
          id = parts[1];
          const hashIdx = parts.indexOf('hash');
          if (hashIdx !== -1 && hashIdx + 1 < parts.length) {
            hash = parts[hashIdx + 1];
          }
        }

        const targetText = ((videoUrl || "") + " " + (videoId || "")).replace(/&amp;/g, '&');
        
        if (!oid || !id) {
          const match = targetText.match(/(?:video|clip)(-?\d+)_(\d+)/);
          if (match) {
            oid = match[1];
            id = match[2];
          }
        }

        if (!hash) {
          const hashMatch = targetText.match(/[?&]hash=([^&"' \s>]+)/) || targetText.match(/_hash_([^&"' \s>_]+)/) || targetText.match(/hash\=([^&"' \s>]+)/);
          if (hashMatch) {
            hash = hashMatch[1];
          }
        }

        if (!oid) oid = "-154942004";
        if (!id) id = "456239102";

        const tParam = baseTime > 0 ? `&t=${Math.floor(baseTime)}` : '';
        const hashParam = hash ? `&hash=${hash}` : '';
        const newUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${id}${hashParam}&hd=1&autoplay=${playbackState.playing ? 1 : 0}${tParam}`;
        if (iframeUrl !== newUrl) {
          setIframeUrl(newUrl);
        }
      } else if (videoSource === 'rutube') {
        const tParam = baseTime > 0 ? `&t=${Math.floor(baseTime)}` : '';
        const newUrl = `https://rutube.ru/play/embed/${videoId}/?autoplay=${playbackState.playing ? 1 : 0}${tParam}`;
        if (iframeUrl !== newUrl) {
          setIframeUrl(newUrl);
        }
      }
    } else if (isPlayStateChanged || isManualSeek) {
      // For VK/RuTube: reload iframe with new parameters for reliable sync
      // postMessage doesn't work reliably due to CORS and iframe restrictions
      console.log('🔄 Reloading iframe for sync:', { isPlayStateChanged, isManualSeek, baseTime });
      
      lastSyncedStateRef.current = {
        videoId,
        playing: playbackState.playing,
        currentTime: playbackState.currentTime
      };

      if (videoSource === 'vk') {
        let oid = "";
        let id = "";
        let hash = "";

        if (videoId && videoId.includes('_')) {
          const parts = videoId.split('_');
          oid = parts[0];
          id = parts[1];
          const hashIdx = parts.indexOf('hash');
          if (hashIdx !== -1 && hashIdx + 1 < parts.length) {
            hash = parts[hashIdx + 1];
          }
        }

        const targetText = ((videoUrl || "") + " " + (videoId || "")).replace(/&amp;/g, '&');
        
        if (!oid || !id) {
          const match = targetText.match(/(?:video|clip)(-?\d+)_(\d+)/);
          if (match) {
            oid = match[1];
            id = match[2];
          }
        }

        if (!hash) {
          const hashMatch = targetText.match(/[?&]hash=([^&"' \s>]+)/) || targetText.match(/_hash_([^&"' \s>_]+)/) || targetText.match(/hash\=([^&"' \s>]+)/);
          if (hashMatch) {
            hash = hashMatch[1];
          }
        }

        if (!oid) oid = "-154942004";
        if (!id) id = "456239102";

        const tParam = baseTime > 0 ? `&t=${Math.floor(baseTime)}` : '';
        const hashParam = hash ? `&hash=${hash}` : '';
        const newUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${id}${hashParam}&hd=1&autoplay=${playbackState.playing ? 1 : 0}${tParam}`;
        console.log('📺 New VK URL:', newUrl);
        setIframeUrl(newUrl);
      } else if (videoSource === 'rutube') {
        const tParam = baseTime > 0 ? `&t=${Math.floor(baseTime)}` : '';
        const newUrl = `https://rutube.ru/play/embed/${videoId}/?autoplay=${playbackState.playing ? 1 : 0}${tParam}`;
        console.log('📺 New RuTube URL:', newUrl);
        setIframeUrl(newUrl);
      }
    } else {
      lastSyncedStateRef.current.currentTime = playbackState.currentTime;
    }
  }, [videoId, videoSource, playbackState.playing, playbackState.currentTime, isLeader, iframeUrl]);

  const handleLeaderHudToggle = () => {
    if (!isLeader) return;
    socket.emit("sync-video", {
      playing: !playbackState.playing,
      currentTime: hudTime
    });
  };

  const handleLeaderHudSeek = (newTime: number) => {
    if (!isLeader) return;
    setHudTime(newTime);
    socket.emit("sync-video", {
      playing: playbackState.playing,
      currentTime: newTime
    });
  };

  const handleQuickSeek = (amount: number) => {
    if (!isLeader) return;
    const newTime = Math.max(0, hudTime + amount);
    handleLeaderHudSeek(newTime);
  };

  const handleLeaderHudReset = () => {
    if (!isLeader) return;
    socket.emit("sync-video", {
      playing: false,
      currentTime: 0
    });
  };

  const triggerReaction = (emoji: string) => {
    if (!socket) return;
    const name = localStorage.getItem('watch_party_user_name') || 'Киноман';
    socket.emit("emoji-reaction", { emoji, userName: name });
  };

  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    const pad = (num: number) => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Dynamic Player block */}
      {videoSource === 'youtube' ? (
        <div className="relative w-full aspect-video">
          <YouTubePlayer
            key={videoId}
            videoId={videoId}
            isLeader={isLeader}
            socket={socket}
            roomId={room.id}
            playbackState={playbackState}
          />
          {/* Reaction layer overlay on top of youtube block */}
          <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
            <AnimatePresence>
              {floatingReactions.map(rect => (
                <motion.div
                  key={rect.id}
                  initial={{ opacity: 0, y: "100%", x: `${rect.x}%`, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 1, 0], y: "-10%", scale: [1, 1.3, 1.3, 0.9] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.5, ease: "easeOut" }}
                  className="absolute bottom-16 text-4xl filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] select-none"
                >
                  {rect.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-4">
          {/* Main Video View Box - strictly aspect-video to maintain rendering profile */}
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#0A0A0A] border border-white/10 shadow-2xl">
            {/* Reaction layer overlay */}
            <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
              <AnimatePresence>
                {floatingReactions.map(rect => (
                  <motion.div
                    key={rect.id}
                    initial={{ opacity: 0, y: "100%", x: `${rect.x}%`, scale: 0.5 }}
                    animate={{ opacity: [0, 1, 1, 0], y: "-10%", scale: [1, 1.3, 1.3, 0.9] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.5, ease: "easeOut" }}
                    className="absolute bottom-16 text-4xl filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] select-none"
                  >
                    {rect.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="w-full h-full relative">
              {videoSource === 'direct' ? (
                <video
                  ref={videoRef}
                  src={decodeURIComponent(videoId)}
                  className="w-full h-full object-contain"
                  onPlay={isLeader ? handleDirectPlay : handleFollowerActionCheck}
                  onPause={isLeader ? handleDirectPause : handleFollowerActionCheck}
                  onSeeked={isLeader ? handleDirectSeeked : handleFollowerActionCheck}
                  onTimeUpdate={handleDirectTimeUpdate}
                  controls={isLeader}
                />
              ) : iframeUrl ? (
                <iframe
                  ref={iframeRef}
                  src={iframeUrl}
                  className="w-full h-full absolute inset-0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  style={{ border: 0 }}
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-400 font-mono text-xs">
                  Подготовка внешнего видеоплеера...
                </div>
              )}

              {!isLeader && (
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/95 backdrop-blur-md border border-white/10 text-xs text-zinc-305 pointer-events-none select-none z-10">
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  <span>Авто-синхронизация по лидеру включена</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls Panel - rendered standalone underneath aspect rating container */}
          <div className="px-5 py-4 bg-[#0A0A0A] border border-white/10 rounded-xl flex flex-col gap-4 backdrop-blur-md shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between w-full">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {isLeader ? (
                  <button
                    onClick={handleLeaderHudToggle}
                    className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center justify-center cursor-pointer shadow-lg active:scale-95 shrink-0"
                    title={playbackState.playing ? "Пауза" : "Запуск"}
                  >
                    {playbackState.playing ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />}
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-500 shrink-0">
                    {playbackState.playing ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce text-indigo-400" /> : <Pause className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>
                )}

                <div className="text-left">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono font-bold">
                    {isLeader ? "Управление Лентой" : "Синхронизация"}
                  </div>
                  <div className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <span className="font-mono text-indigo-400 text-base">{formatTime(hudTime)}</span>
                    <span className="text-zinc-700">/</span>
                    <span className="text-zinc-400 text-xs font-sans">
                      {playbackState.playing ? "Прямой Эфир" : "Пауза"}
                    </span>
                  </div>
                </div>
              </div>

              {!isLeader && (
                <div className="text-xs text-zinc-500 italic bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg font-mono">
                  Смотрите фильм синхронно с Лидером
                </div>
              )}
            </div>

            {isLeader && videoSource !== 'direct' && (
              <div className="w-full border-t border-white/5 pt-3.5 flex flex-col gap-3">
                {/* Timeline slider itself */}
                <div className="flex items-center gap-3 w-full">
                  <span className="text-[10px] text-zinc-500 font-mono select-none">0:00</span>
                  <div className="flex-1 relative">
                    <input
                       type="range"
                       min="0"
                       max={Math.max(14400, hudTime + 7200)}
                       value={hudTime}
                       onChange={(e) => handleLeaderHudSeek(parseInt(e.target.value))}
                       className="w-full h-1.5 rounded-lg bg-zinc-800 accent-indigo-500 cursor-pointer appearance-none transition-colors hover:bg-zinc-750/90 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono select-none">
                    {formatTime(Math.max(14400, hudTime + 7200))}
                  </span>
                </div>

                {/* Quick Seek buttons for touchscreens / general use */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[11px] font-mono">
                  <button
                    onClick={() => handleQuickSeek(-600)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="-10 минут"
                  >
                    -10м
                  </button>
                  <button
                    onClick={() => handleQuickSeek(-60)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="-1 минута"
                  >
                    -1м
                  </button>
                  <button
                    onClick={() => handleQuickSeek(-10)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="-10 секунд"
                  >
                    -10с
                  </button>
                  
                  {/* Reset Button */}
                  <button
                    onClick={handleLeaderHudReset}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:text-white hover:bg-indigo-600/30 transition-all cursor-pointer flex items-center gap-1.5 select-none active:scale-95"
                    title="В начало (0:00)"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-indigo-400 animate-spin-slow" />
                    <span>0:00</span>
                  </button>

                  <button
                    onClick={() => handleQuickSeek(10)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="+10 секунд"
                  >
                    +10с
                  </button>
                  <button
                    onClick={() => handleQuickSeek(60)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="+1 минута"
                  >
                    +1м
                  </button>
                  <button
                    onClick={() => handleQuickSeek(600)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none active:scale-95"
                    title="+10 минут"
                  >
                    +10м
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Synchronized Reaction Controls HUD (Twitch / unotalone.su Style) */}
      <div className="w-full shrink-0 flex flex-wrap items-center justify-between gap-3 bg-[#0A0A0A]/60 border border-white/5 rounded-2xl px-5 py-3 backdrop-blur-lg">
        <div className="flex gap-2 items-center">
          <span className="text-[10px] uppercase font-mono font-extrabold text-zinc-500 tracking-wider">
            Отправить эмоцию в эфир:
          </span>
          <div className="flex items-center gap-2.5">
            {['❤️', '😂', '😮', '👏', '🔥'].map(emoji => (
              <button
                key={emoji}
                onClick={() => triggerReaction(emoji)}
                className="text-xl hover:scale-130 hover:-rotate-6 active:scale-95 transition-transform p-1.5 hover:bg-white/5 rounded-xl cursor-pointer select-none"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Sync notification banner */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${playbackState.playing ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[10px] text-zinc-400 font-mono">
            {playbackState.playing ? "АКТИВНО" : "ПРИОСТАНОВЛЕНО"} • {formatTime(playbackState.currentTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
