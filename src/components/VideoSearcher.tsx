import { useState, useEffect, FormEvent } from 'react';
import { Search, Youtube, Film, Loader2, Link as LinkIcon, CheckCircle2, ListPlus, Radio } from 'lucide-react';
import { SearchResult } from '../types';

interface VideoSearcherProps {
  isLeader: boolean;
  socket: any;
}

export default function VideoSearcher({ isLeader, socket }: VideoSearcherProps) {
  const [query, setQuery] = useState<string>('');
  const [platform, setPlatform] = useState<'youtube' | 'vk' | 'rutube'>('youtube');
  const [directUrl, setDirectUrl] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTimer, setSearchTimer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'paste'>('search');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Handle instant search triggers with debounce
  useEffect(() => {
    if (activeTab !== 'search') return;
    if (query.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    if (searchTimer) clearTimeout(searchTimer);

    const timer = setTimeout(() => {
      triggerSearch();
    }, 600);

    setSearchTimer(timer);

    return () => clearTimeout(timer);
  }, [query, platform, activeTab]);

  const triggerSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      // Use backend URL from environment variable
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      console.log('🔍 Searching on backend:', backendUrl);
      const response = await fetch(`${backendUrl}/api/search?q=${encodeURIComponent(query)}&platform=${platform}`);
      const data = await response.json();
      console.log('📥 Search results:', data);
      if (Array.isArray(data)) {
        setSearchResults(data);
      }
    } catch (e) {
      console.error("Failed to query search: ", e);
    } finally {
      setLoading(false);
    }
  };

  // Helper parser for VK and general links
  const parsePastedUrl = (urlStr: string) => {
    // Clean up html entities and trim
    const url = urlStr.trim().replace(/&amp;/g, '&').replace(/%2[fF]/g, '/');
    let parsedId = "";
    let parsedPlatform: 'youtube' | 'vk' | 'rutube' | 'direct' = 'youtube';
    let parsedTitle = "Внешний видеопоток";

    // 1. YouTube checks
    if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
      parsedPlatform = 'youtube';
      parsedTitle = "Видео YouTube";
      if (url.includes('youtu.be/')) {
        const parts = url.split('youtu.be/');
        parsedId = parts[1].split(/[?#]/)[0];
      } else if (url.includes('v=')) {
        const searchParams = new URL(url).searchParams;
        parsedId = searchParams.get('v') || "";
      } else if (url.includes('/embed/')) {
        const parts = url.split('/embed/');
        parsedId = parts[1].split(/[?#]/)[0];
      }
    } 
    // 2. VK Video checks (Advanced extraction for iframe parameters)
    else if (url.includes('vk.com/') || url.includes('vkvideo.ru/') || url.includes('video_ext.php')) {
      parsedPlatform = 'vk';
      parsedTitle = "Фильм VK Видео";

      // Extract src attribute if pasting whole HTML iframe code
      const srcMatch = url.match(/src="([^"]+)"/) || url.match(/src='([^']+)'/);
      const targetUrl = srcMatch ? srcMatch[1] : url;

      let oid = "";
      let id = "";
      let hash = "";

      // Try extraction using URL search parameters
      try {
        const urlObj = new URL(targetUrl.startsWith('//') ? 'https:' + targetUrl : targetUrl);
        oid = urlObj.searchParams.get('oid') || "";
        id = urlObj.searchParams.get('id') || "";
        hash = urlObj.searchParams.get('hash') || "";
      } catch (e) {
        // Safe skip to regex fallbacks
      }

      // If URL parser missed oid/id, match key parameters with regex
      if (!oid || !id) {
        const oidMatch = targetUrl.match(/[?&]oid=(-?\d+)/);
        const idMatch = targetUrl.match(/[?&]id=(\d+)/);
        if (oidMatch && idMatch) {
          oid = oidMatch[1];
          id = idMatch[1];
        }
      }

      // Try extracting based on /video-oid_id or similar patterns
      if (!oid || !id) {
        const patternMatch = targetUrl.match(/(?:video|clip)(-?\d+)_(\d+)/);
        if (patternMatch) {
          oid = patternMatch[1];
          id = patternMatch[2];
        }
      }

      // Extract hash security parameter broadly to ensure cross-domain embeds load perfectly
      if (!hash) {
        const hashMatch = targetUrl.match(/[?&]hash=([^&"' \s>]+)/) || targetUrl.match(/_hash_([^&"' \s>_]+)/) || targetUrl.match(/hash\=([^&"' \s>]+)/);
        if (hashMatch) {
          hash = hashMatch[1];
        }
      }

      if (oid && id) {
        parsedId = `${oid}_${id}${hash ? `_hash_${hash}` : ""}`;
      } else {
        parsedId = "1_1"; // Default fallback
      }
    }
    // 3. RuTube checks
    else if (url.includes('rutube.ru/')) {
      parsedPlatform = 'rutube';
      parsedTitle = "Фильм RuTube";
      if (url.includes('/video/')) {
        const parts = url.split('/video/');
        parsedId = parts[1].split('/')[0];
      } else if (url.includes('/play/embed/')) {
        const parts = url.split('/play/embed/');
        parsedId = parts[1].split('/')[0];
      }
    }
    // 4. Direct video host checks (.mp4, .m3u8 streams)
    else if (url.startsWith('http')) {
      parsedPlatform = 'direct';
      try {
        const urlObj = new URL(url);
        const filename = urlObj.pathname.split('/').pop() || "Прямой поток";
        parsedTitle = decodeURIComponent(filename) || "Киносеанс по прямой ссылке";
      } catch (e) {
        parsedTitle = "Киносеанс по прямой ссылке";
      }
      parsedId = encodeURIComponent(url);
    }

    return { parsedId, parsedPlatform, parsedTitle, url };
  };

  const handleUrlSubmitImmediate = (e: FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim()) return;

    if (!isLeader) {
      alert("Смена видео доступна только лидеру комнаты!");
      return;
    }

    const { parsedId, parsedPlatform, parsedTitle, url } = parsePastedUrl(directUrl);

    if (parsedId) {
      triggerVideoChange({
        id: parsedId,
        title: parsedTitle,
        url: url,
        platform: parsedPlatform,
        thumbnail: ""
      });
      setDirectUrl("");
    } else {
      alert("Не удалось определить формат URL. Поддерживаются ссылки YouTube, VK Видео, RuTube, а также прямые медиа (MP4, HLS m3u8).");
    }
  };

  const handleUrlSubmitQueue = () => {
    if (!directUrl.trim()) return;

    const { parsedId, parsedPlatform, parsedTitle, url } = parsePastedUrl(directUrl);

    if (parsedId) {
      triggerAddToPlaylist({
        id: parsedId,
        title: parsedTitle,
        url: url,
        platform: parsedPlatform,
        thumbnail: ""
      });
      setDirectUrl("");
    } else {
      alert("Не удалось определить формат URL.");
    }
  };

  const triggerVideoChange = (video: SearchResult) => {
    if (!isLeader || !socket) return;

    socket.emit("update-video", {
      videoSource: video.platform,
      videoId: video.id,
      videoTitle: video.title,
      videoUrl: video.url
    });

    setSuccessMsg(`Трансляция видео "${video.title}" запущена для всех!`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const triggerAddToPlaylist = (video: SearchResult) => {
    if (!socket) return;
    const name = localStorage.getItem('watch_party_user_name') || 'Киноман';

    socket.emit("add-to-playlist", {
      videoId: video.id,
      title: video.title,
      url: video.url,
      platform: video.platform,
      thumbnail: video.thumbnail || "",
      duration: video.duration || "0:00",
      addedBy: name
    });

    setSuccessMsg(`Видео "${video.title}" успешно добавлено в очередь плейлиста!`);
    setTimeout(() => setSuccessMsg(''), 4300);
  };

  return (
    <div className="w-full bg-[#0A0A0A]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl relative shadow-2xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-indigo-400" />
            Выбор Медиафайла для Просмотра
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Найдите ролики в поиске или вставьте прямую ссылку. Панель доступна для добавления в очередь всем участникам!
          </p>
        </div>

        {/* Tab Switch Toggles */}
        <div className="flex bg-[#050505] p-1 rounded-lg border border-white/10 self-end md:self-auto shrink-0 z-20">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeTab === 'search' ? 'bg-indigo-600 text-white shadow-md font-sans' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Искать ролики
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeTab === 'paste' ? 'bg-indigo-600 text-white shadow-md font-sans' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Вставить инфо-ссылку
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in z-20 relative">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'search' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Direct query input */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Что смотрим сегодня? Фильмы, клипы, треки, релакс..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-sans"
              />
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
            </div>

            {/* Platform selection radio */}
            <div className="flex bg-black/60 rounded-xl p-1 border border-white/10 shrink-0 gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setPlatform('youtube')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${platform === 'youtube' ? 'bg-red-600/15 text-red-400 border border-red-500/10' : 'text-zinc-500 hover:text-zinc-200 border border-transparent'}`}
              >
                <Youtube className="w-3.5 h-3.5" />
                YOUTUBE
              </button>
              <button
                type="button"
                onClick={() => setPlatform('vk')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${platform === 'vk' ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/10' : 'text-zinc-500 hover:text-zinc-200 border border-transparent'}`}
              >
                <Radio className="w-3.5 h-3.5" />
                VK ВИДЕО
              </button>
              <button
                type="button"
                onClick={() => setPlatform('rutube')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${platform === 'rutube' ? 'bg-amber-600/15 text-amber-400 border border-amber-500/10' : 'text-zinc-500 hover:text-zinc-200 border border-transparent'}`}
              >
                <Radio className="w-3.5 h-3.5" />
                RUTUBE
              </button>
            </div>
          </div>

          {/* Results grid */}
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-zinc-400 text-xs font-mono">Выполняем поиск через Скрапер & ИИ...</span>
            </div>
          )}

          {!loading && searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2 max-h-[310px] overflow-y-auto pr-1 invisible-scrollbar">
              {searchResults.map((video) => (
                <div
                  key={video.id}
                  className="group bg-black/50 rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/30 cursor-pointer transition-all flex flex-col hover:shadow-xl duration-200 relative"
                >
                  <div className="aspect-video relative overflow-hidden bg-zinc-900 border-b border-white/10">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#050505] font-mono text-xs text-zinc-650">
                        No Preview
                      </div>
                    )}
                    {video.duration && (
                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono font-bold text-white leading-none">
                        {video.duration}
                      </span>
                    )}
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/90 text-[8px] text-zinc-400 uppercase border border-white/10 leading-none font-bold font-mono">
                      {video.platform}
                    </span>
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                    <p className="text-xs font-semibold text-zinc-300 line-clamp-2 leading-snug group-hover:text-white transition-colors">
                      {video.title}
                    </p>
                    <div className="flex gap-1.5">
                      {isLeader && (
                        <button
                          onClick={() => triggerVideoChange(video)}
                          className="flex-1 py-1 px-2 text-[10px] font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer text-center font-sans uppercase"
                        >
                          Смотреть
                        </button>
                      )}
                      <button
                        onClick={() => triggerAddToPlaylist(video)}
                        className="flex-1 py-1 px-2 text-[10px] font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white border border-white/5 transition-colors cursor-pointer flex items-center justify-center gap-1 font-sans uppercase"
                        title="Добавить в очередь воспроизведения"
                      >
                        <ListPlus className="w-3 h-3 shrink-0" />
                        Очередь
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && query.trim().length >= 3 && searchResults.length === 0 && (
            <div className="py-8 text-center text-zinc-500 text-xs font-sans">
              Ничего не найдено по вашему ИИ-запросу. Попробуйте поискать на другом языке или введите простые фразы.
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <form className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="url"
                placeholder="Вставьте ссылку на YouTube, RuTube, VK Видео (или прямую ссылку на .mp4 фильм)"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                className="w-full bg-black/55 border border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-sans"
                required
              />
              <LinkIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-4" />
            </div>
            
            <div className="flex gap-2 shrink-0">
              {isLeader && (
                <button
                  type="button"
                  onClick={handleUrlSubmitImmediate}
                  className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer shadow-lg shadow-indigo-600/15 uppercase font-sans tracking-wide"
                >
                  Включить сейчас
                </button>
              )}
              <button
                type="button"
                onClick={handleUrlSubmitQueue}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 uppercase font-sans tracking-wide"
              >
                <ListPlus className="w-4 h-4 text-indigo-400" />
                В очередь
              </button>
            </div>
          </form>

          {/* Prompt/Instruction guides for VK video embedding */}
          <div className="p-3.5 bg-indigo-950/20 rounded-xl border border-indigo-500/10 leading-relaxed font-sans mt-1">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1.5 font-mono">
              💡 Полезная подсказка по VK Видео и RuTube:
            </h4>
            <p className="text-[10px] text-zinc-400">
              Если фильм или клип из <span className="text-zinc-200">VK</span> заблокирован или не открывается из-за региона, откройте видео на самом сайте VK, в меню <span className="text-zinc-200">"Поделиться" &rarr; "Экспорт" (Код вставки)</span> скопируйте код iframe (или ссылку src) и вставьте его сюда. Мы извлечем специальный <span className="text-indigo-400 font-bold font-mono">hash</span>, который разблокирует закрытый запуск!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
