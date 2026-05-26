import { Play, Trash2, ListMusic, ChevronRight } from 'lucide-react';
import { PlaylistItem } from '../types';

interface PlaylistQueueProps {
  playlist: PlaylistItem[];
  isLeader: boolean;
  socket: any;
  currentUserId: string;
}

export default function PlaylistQueue({
  playlist = [],
  isLeader,
  socket,
  currentUserId
}: PlaylistQueueProps) {

  const handleRemove = (itemId: string) => {
    if (!socket) return;
    socket.emit("remove-from-playlist", { itemId });
  };

  const handlePlayNext = () => {
    if (!socket || !isLeader) return;
    socket.emit("play-next-playlist");
  };

  const handleClear = () => {
    if (!socket || !isLeader) return;
    if (window.confirm("Очистить весь плейлист?")) {
      socket.emit("clear-playlist");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]/90 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between mb-3 shrink-0 pb-2 border-b border-white/5">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-indigo-400" />
          В очереди ({playlist.length})
        </h3>
        {isLeader && playlist.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handlePlayNext}
              className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
            >
              Включить след. <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={handleClear}
              className="text-[10px] font-mono font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-2 py-1 rounded transition-colors cursor-pointer"
            >
              Очистить
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[250px] md:max-h-none min-h-[140px] invisible-scrollbar">
        {playlist.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-zinc-600 mb-2">
              <ListMusic className="w-5 h-5 opacity-40" />
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed font-sans max-w-[220px]">
              Плейлист пуст. Любой зритель может добавить видео в очередь из строки поиска!
            </p>
          </div>
        ) : (
          playlist.map((item, index) => (
            <div
              key={item.id}
              className="group flex gap-2.5 p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all items-center justify-between"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Number index */}
                <span className="text-xs font-mono font-bold text-zinc-650 w-4 select-none text-center">
                  {index + 1}
                </span>

                {/* Preview Thumbnail */}
                <div className="w-14 aspect-video rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/5 relative">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] font-mono text-zinc-600 bg-black">
                      PLAY
                    </div>
                  )}
                  {item.duration && (
                    <span className="absolute bottom-0.5 right-0.5 px-1 py-0.1 bg-black/85 text-[8px] font-mono font-bold text-white rounded">
                      {item.duration}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-200 line-clamp-1 group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </p>
                  <p className="text-[9px] font-sans text-zinc-550 mt-0.5 flex items-center gap-1">
                    <span className="bg-white/5 px-1 py-0.1 rounded text-[8px] uppercase tracking-wider font-bold">
                      {item.platform}
                    </span>
                    <span>• добавил: {item.addedBy}</span>
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5 shrink-0 pl-1">
                {isLeader && (
                  <button
                    onClick={() => {
                      if (socket) {
                        socket.emit("update-video", {
                          videoSource: item.platform,
                          videoId: item.videoId,
                          videoTitle: item.title,
                          videoUrl: item.url
                        });
                        // Remove from playlist list once started
                        handleRemove(item.id);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white transition-all cursor-pointer"
                    title="Запустить немедленно"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
                {(isLeader || item.addedBy === localStorage.getItem('watch_party_user_name')) && (
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-650 text-red-400 hover:text-white transition-all cursor-pointer"
                    title="Удалить из очереди"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
