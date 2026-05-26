import { useEffect, useRef, useState } from 'react';
import { PlaybackState } from '../types';
import { Play } from 'lucide-react';

interface YouTubePlayerProps {
  key?: string;
  videoId: string;
  isLeader: boolean;
  socket: any;
  roomId: string;
  playbackState: PlaybackState;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: (() => void) | undefined;
    YT: any;
  }
}

export default function YouTubePlayer({
  videoId,
  isLeader,
  socket,
  roomId,
  playbackState
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const isRemoteActionRef = useRef<boolean>(false);
  const syncIntervalRef = useRef<any>(null);
  const lastStateRef = useRef<{ playing: boolean; currentTime: number }>({ playing: false, currentTime: 0 });
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const playerReadyRef = useRef<boolean>(false);
  const [isPlayingLocal, setIsPlayingLocal] = useState<boolean>(false);
  const [useFallback, setUseFallback] = useState<boolean>(false);
  const lastRemoteActionTimeRef = useRef<number>(0);
  const initTimeoutRef = useRef<any>(null);

  // Keep an up-to-date ref of all active props to resolve all stale closure executions under asynchronous timers
  const propsRef = useRef({ videoId, isLeader, playbackState, socket });
  useEffect(() => {
    propsRef.current = { videoId, isLeader, playbackState, socket };
  }, [videoId, isLeader, playbackState, socket]);

  const handleUnblockAutoplay = () => {
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      isRemoteActionRef.current = true;
      lastRemoteActionTimeRef.current = Date.now();
      player.playVideo();
      setIsPlayingLocal(true);
      setTimeout(() => {
        isRemoteActionRef.current = false;
      }, 1500);
    }
  };

  // Load YouTube IFrame API script with robust polling and automatic fallback
  useEffect(() => {
    setUseFallback(false);
    
    // Set up a safeguard fallback timer. If the Youtube API 
    // is blocked by tracking protection, cookies, or iframe policies,
    // we seamlessly fall back to a standard YouTube embed after 3.5 seconds.
    const fallbackTimer = setTimeout(() => {
      if (!playerReadyRef.current) {
        setUseFallback(true);
      }
    }, 3500);

    const checkAndInit = () => {
      if (window.YT && window.YT.Player) {
        initializePlayer();
      } else {
        if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = setTimeout(checkAndInit, 100);
      }
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        checkAndInit();
      };
    } else {
      checkAndInit();
    }

    return () => {
      clearTimeout(fallbackTimer);
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      destroyPlayer();
    };
  }, [videoId]); // Re-initialize if videoId changes

  const initializePlayer = () => {
    if (!window.YT || !window.YT.Player) return;
    if (!containerRef.current) {
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = setTimeout(initializePlayer, 100);
      return;
    }

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    // Direct cleaner destruction if previous instance exists
    if (playerRef.current) {
      destroyPlayer();
    }

    const currentProps = propsRef.current;
    const elapsedOffset = (!currentProps.isLeader && currentProps.playbackState.playing && currentProps.playbackState.lastUpdated)
      ? (Date.now() - currentProps.playbackState.lastUpdated) / 1000
      : 0;
    const computedStartTime = Math.max(0, currentProps.playbackState.currentTime + elapsedOffset);

    try {
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: currentProps.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: currentProps.playbackState.playing ? 1 : 0,
          controls: 1, // Let everyone have controls to allow browser engagement (unblocks autoplay policy restrictions)
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
          start: Math.floor(computedStartTime)
        },
        events: {
          onReady: (event: any) => {
            setPlayerReady(true);
            playerReadyRef.current = true;
            setUseFallback(false);
            // Apply initial playbackState once ready
            isRemoteActionRef.current = true;
            lastRemoteActionTimeRef.current = Date.now();
            const latestProps = propsRef.current;
            if (latestProps.playbackState.playing) {
              if (event.target && typeof event.target.playVideo === 'function') {
                event.target.playVideo();
              }
              setIsPlayingLocal(true);
            } else {
              if (event.target && typeof event.target.pauseVideo === 'function') {
                event.target.pauseVideo();
              }
              setIsPlayingLocal(false);
            }
            if (computedStartTime > 0 && event.target && typeof event.target.seekTo === 'function') {
              event.target.seekTo(computedStartTime, true);
            }
            setTimeout(() => {
              isRemoteActionRef.current = false;
            }, 1200);
          },
          onStateChange: (event: any) => {
            setIsPlayingLocal(event.data === 1);
            handlePlayerStateChange(event.data);
          }
        }
      });
    } catch (e) {
      console.warn("Failed to initialize YT Player via API, fallback mode triggered:", e);
      setUseFallback(true);
    }
  };

  const destroyPlayer = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }
    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
      try {
        playerRef.current.destroy();
      } catch (e) {
        console.warn('Silent player cleanup error:', e);
      }
      playerRef.current = null;
    }
    setPlayerReady(false);
    playerReadyRef.current = false;
  };

  // Listen to incoming real-time socket updates (Playback State Sync)
  useEffect(() => {
    if (!socket || !playerReady || !playerRef.current) return;

    const handleRemotePlaybackChange = (newState: PlaybackState) => {
      // If we are leader, ignore incoming changes to avoid override races
      if (propsRef.current.isLeader) return;

      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function' || typeof player.getCurrentTime !== 'function') return;

      isRemoteActionRef.current = true;
      lastRemoteActionTimeRef.current = Date.now();

      const currentStatus = player.getPlayerState(); // 1: playing, 2: paused
      const isCurrentlyPlaying = currentStatus === 1;
      const playerTime = player.getCurrentTime();

      // Resolve playing state difference
      if (newState.playing && !isCurrentlyPlaying && typeof player.playVideo === 'function') {
        player.playVideo();
      } else if (!newState.playing && isCurrentlyPlaying && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
      }

      // Check for alignment. If off by more than 2 seconds, auto-resync seek
      const drift = Math.abs(playerTime - newState.currentTime);
      console.log('🎯 YouTube sync check - drift:', drift.toFixed(2), 'seconds');
      if (drift > 2 && typeof player.seekTo === 'function') {
        console.log('🔄 Resyncing YouTube to:', newState.currentTime.toFixed(2));
        player.seekTo(newState.currentTime, true);
      }

      // Reset the update flag after rendering completes to allow local events again
      setTimeout(() => {
        isRemoteActionRef.current = false;
      }, 1200);
    };

    socket.on("playback-changed", handleRemotePlaybackChange);

    return () => {
      socket.off("playback-changed", handleRemotePlaybackChange);
    };
  }, [socket, playerReady, isLeader, videoId]);

  // Periodic heartbeat / state sync for leader & non-leader reconciliation
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    syncIntervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function' || typeof player.getCurrentTime !== 'function') return;

      const playerStatus = player.getPlayerState();
      const isPlaying = playerStatus === 1;
      const currentTime = player.getCurrentTime() || 0;

      const latestProps = propsRef.current;

      if (latestProps.isLeader) {
        // LEADER: Heartbeat broadcast state updates every 3 seconds to ensure sync stability
        const timeDelta = Math.abs(currentTime - lastStateRef.current.currentTime);
        const stateChanged = isPlaying !== lastStateRef.current.playing || timeDelta > 1.5;

        if (stateChanged) {
          lastStateRef.current = { playing: isPlaying, currentTime };
          latestProps.socket.emit("sync-video", {
            playing: isPlaying,
            currentTime
          });
        }
      } else {
        // FOLLOWER: Auto-reconciliation if follower deviates from server's designated target frame
        if (latestProps.playbackState) {
          const expectedTime = latestProps.playbackState.playing 
            ? latestProps.playbackState.currentTime + (Date.now() - latestProps.playbackState.lastUpdated) / 1000
            : latestProps.playbackState.currentTime;

          const currentStatus = player.getPlayerState();
          const pPlaying = currentStatus === 1;
          const drift = Math.abs(currentTime - expectedTime);

          // Force play state match
          if (latestProps.playbackState.playing && !pPlaying && typeof player.playVideo === 'function') {
            isRemoteActionRef.current = true;
            lastRemoteActionTimeRef.current = Date.now();
            player.playVideo();
            setTimeout(() => {
              isRemoteActionRef.current = false;
            }, 1200);
          } else if (!latestProps.playbackState.playing && pPlaying && typeof player.pauseVideo === 'function') {
            isRemoteActionRef.current = true;
            lastRemoteActionTimeRef.current = Date.now();
            player.pauseVideo();
            setTimeout(() => {
              isRemoteActionRef.current = false;
            }, 1200);
          }

          // Force seek alignment if drift exceeds 2 seconds under active play state
          if (drift > 2 && typeof player.seekTo === 'function') {
            console.log('🔄 Periodic resync - drift:', drift.toFixed(2), 'expected:', expectedTime.toFixed(2));
            isRemoteActionRef.current = true;
            lastRemoteActionTimeRef.current = Date.now();
            player.seekTo(expectedTime, true);
            setTimeout(() => {
              isRemoteActionRef.current = false;
            }, 1200);
          }
        }
      }
    }, 2000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [playerReady, isLeader, playbackState, videoId, socket]);

  // Handle local player actions (only triggers server update when LEADER executes them)
  const handlePlayerStateChange = (state: number) => {
    const isWithinRemoteWindow = Date.now() - lastRemoteActionTimeRef.current < 2000;
    const latestProps = propsRef.current;

    if (!latestProps.isLeader) {
      // Enforce lock: Non-leaders cannot override room timeline.
      // If a non-leader pauses/plays/seeks, we revert their action using server room status.
      if (!isRemoteActionRef.current && !isWithinRemoteWindow) {
        const player = playerRef.current;
        if (player && typeof player.seekTo === 'function') {
          isRemoteActionRef.current = true;
          lastRemoteActionTimeRef.current = Date.now();
          // Return non-leader back to sync state
          if (latestProps.playbackState.playing && typeof player.playVideo === 'function') {
            player.playVideo();
          } else if (typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          player.seekTo(latestProps.playbackState.currentTime, true);
          setTimeout(() => {
            isRemoteActionRef.current = false;
          }, 1200);
        }
      }
      return;
    }

    if (isRemoteActionRef.current || isWithinRemoteWindow) return;

    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return;

    const isPlaying = state === 1; // 1 represents playing state in YT API
    const currentTime = player.getCurrentTime() || 0;

    lastStateRef.current = { playing: isPlaying, currentTime };
    
    // Broadcast Leader's real-time state change immediately
    latestProps.socket.emit("sync-video", {
      playing: isPlaying,
      currentTime
    });
  };

  const elapsedOffset = (!isLeader && playbackState.playing && playbackState.lastUpdated)
    ? (Date.now() - playbackState.lastUpdated) / 1000
    : 0;
  const computedStartTime = Math.max(0, playbackState.currentTime + elapsedOffset);
  const fallbackUrl = `https://www.youtube.com/embed/${videoId}?autoplay=${playbackState.playing ? 1 : 0}&start=${Math.floor(computedStartTime)}&controls=1&rel=0&enablejsapi=1`;

  if (useFallback) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#0A0A0A] border border-white/10 shadow-2xl">
        <iframe
          src={fallbackUrl}
          className="w-full h-full absolute inset-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          style={{ border: 0 }}
          allowFullScreen
        />
        {!isLeader && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/95 backdrop-blur-md border border-white/10 text-xs text-zinc-300 pointer-events-none select-none z-10">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <span>Авто-синхронизация YouTube (Iframe)</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl">
      <div ref={containerRef} className="w-full h-full skeleton-glow" />
      
      {!playerReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-xs text-zinc-400">Синхронизация потока YouTube...</p>
        </div>
      )}

      {/* Manual Unblock / Sync Overlay for Followers to circumvent browser autoplay restrictions */}
      {playerReady && playbackState.playing && !isPlayingLocal && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-4 transition-all z-20">
          <div className="p-4 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 animate-pulse">
            <Play className="w-6 h-6 fill-current" />
          </div>
          <div className="text-center px-4 max-w-xs">
            <h4 className="text-sm font-bold text-white mb-1">Поток запущен лидером</h4>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Ваш браузер временно приостановил автоматический запуск. Нажмите кнопку ниже для подключения к трансляции.
            </p>
          </div>
          <button
            onClick={handleUnblockAutoplay}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/35 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Войти в эфир
          </button>
        </div>
      )}
    </div>
  );
}
