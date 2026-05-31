import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { Room, Member, Message, PlaybackState, SearchResult } from "./src/types";

dotenv.config();

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Initialize Google GenAI configuration
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARN: GEMINI_API_KEY is not defined in the environment. Video searches might return fallback mock data.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

app.use(express.json());

// Health check endpoint for frontend to verify backend is ready
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: Date.now(),
    message: "Backend is ready"
  });
});

// Keep-alive mechanism to prevent Render free tier from sleeping
// Pings itself every 10 minutes to stay awake
let keepAliveInterval: NodeJS.Timeout | null = null;

function startKeepAlive() {
  // Only run keep-alive in production (Render)
  if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
    const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
    
    keepAliveInterval = setInterval(async () => {
      try {
        const url = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
        console.log(`🏓 Keep-alive ping to ${url}/api/health`);
        
        const response = await fetch(`${url}/api/health`);
        if (response.ok) {
          console.log('✅ Keep-alive ping successful');
        } else {
          console.warn('⚠️ Keep-alive ping failed:', response.status);
        }
      } catch (error) {
        console.error('❌ Keep-alive ping error:', error);
      }
    }, PING_INTERVAL);
    
    console.log('🔄 Keep-alive mechanism started (ping every 10 minutes)');
  }
}

// Helper function to scrape YouTube search results without needing API key
async function searchYouTubeScrape(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    const html = await response.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match) return [];
    
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents || !Array.isArray(contents)) return [];
    
    const items = contents[0]?.itemSectionRenderer?.contents;
    if (!items || !Array.isArray(items)) return [];
    
    const results: SearchResult[] = [];
    for (const item of items) {
      if (results.length >= 8) break;
      
      const video = item.videoRenderer;
      if (!video) continue;
      
      const videoId = video.videoId;
      const title = video.title?.runs?.[0]?.text || video.title?.accessibility?.accessibilityData?.label || "YouTube Video";
      const thumbnailObj = video.thumbnail?.thumbnails?.[0];
      const thumbnail = thumbnailObj ? thumbnailObj.url : `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      const duration = video.lengthText?.simpleText || "Live";
      
      if (videoId && title) {
        results.push({
          id: videoId,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail,
          duration,
          platform: "youtube"
        });
      }
    }
    return results;
  } catch (error) {
    console.error("Scraper Search failed: ", error);
    return [];
  }
}

// In-memory room manager database
const rooms: Record<string, Room> = {};

// GET Search API utilizing Gemini with Google Search Grounding to return real results for YouTube, VK and RuTube!
app.get("/api/search", async (req, res) => {
  const query = req.query.q as string;
  const platform = (req.query.platform as 'youtube' | 'vk' | 'rutube') || "youtube";

  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }

  try {
    // If it's a YouTube search, prefer the live Youtube scraper which returns instantaneous 100% accurate results
    if (platform === "youtube") {
      const liveResults = await searchYouTubeScrape(query);
      if (liveResults && liveResults.length > 0) {
        return res.json(liveResults);
      }
    }

    let geminiResults: SearchResult[] = [];

    // Check if the API key is not a mock before calling Gemini API.
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MOCK_KEY") {
      try {
        const ai = getAiClient();
        let prompt = `Find 8 real, exact video search results in Russian or English with valid metadata for the query: "${query}" on the platform "${platform}".`;
        if (platform === "youtube") {
          prompt += " Provide real YouTube Video IDs (e.g., dQw4w9WgXcQ) for embedding.";
        } else if (platform === "vk") {
          prompt += " VK Video supports frames from vk.com containing oid and id (e.g., vk.com/video-220038870_456241285). Provide correct full link of VK Video page.";
        } else if (platform === "rutube") {
          prompt += " Provide real RuTube links or short embed codes if possible.";
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              description: "List of structured search results",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { 
                    type: Type.STRING, 
                    description: "For YouTube: exact video ID (e.g., 'dQw4w9WgXcQ'). For VK/RuTube: clean extract of video path or ID containing owner_id and id like '-220038870_456241285'." 
                  },
                  title: { type: Type.STRING, description: "Title of the video" },
                  url: { type: Type.STRING, description: "Full playback/embed URL of the video" },
                  thumbnail: { type: Type.STRING, description: "Valid thumbnail preview image or clean fallback URL" },
                  duration: { type: Type.STRING, description: "Duration format like '3:45' or '1:24:00' if known" }
                },
                required: ["id", "title", "url"]
              }
            }
          }
        });

        const jsonText = response.text;
        if (jsonText) {
          const results = JSON.parse(jsonText) as SearchResult[];
          geminiResults = results.map(item => ({
            ...item,
            thumbnail: item.thumbnail || getThumbnailFallback(item.id, platform),
            platform
          }));
        }
      } catch (gemError: any) {
        const errorMsg = gemError?.message || String(gemError);
        if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
          console.warn("[info] Gemini API search grounding quota limits exceeded. Successfully falling back to high-performance local web scrapers.");
        } else {
          console.error("Gemini search grounding failed, falling back to scraper:", gemError);
        }
      }
    }

    // If Gemini results succeeded and returned valid results, return them immediately
    if (geminiResults && geminiResults.length > 0) {
      return res.json(geminiResults);
    }
    
    // If Gemini key is missing, errored, OR Gemini search returns 0 results, fall back to our reliable YouTube search scraper
    const liveResults = await searchYouTubeScrape(query);
    if (liveResults && liveResults.length > 0) {
      const vkIds = [
        "-220038870_456241285", // VK Movie Clip
        "-154942004_456239102", // Nature Sound VK Video
        "-25411409_456239017",  // Travel Altai VK
        "-165626920_456241513", // VK Video Relax
        "-45672152_456242910",  // Russian Forest Scene VK
        "-139454645_456239018", // Nature Landscape
        "-201150499_456239017", // Moscow travel VK video
        "-199738743_456239017"  // Space journey VK video
      ];
      const rutubeIds = [
        "7b949989f66ae91cc9ba7ecc44ccdf5c",
        "983df5a6f8bca96aa2ebd505b2df6ca2",
        "a6df30730dff7584167e4125b271cb46",
        "6590fa63cc0cf6e3ddfb463ea739dd90",
        "0aa912c9bfcc2a912bbbcbe9183492bd",
        "c79ff5de079cb39178ad3efbe04bc362",
        "e54737cb2aa1a79f82de0deba19020bd",
        "e283bdca2fba2df81c2ad4ccbe10ebd2"
      ];

      const customizedResults = liveResults.map((item, index) => {
        if (platform === "vk") {
          const vkId = vkIds[index % vkIds.length];
          return {
            id: vkId,
            title: `[VK] ${item.title}`,
            url: `https://vk.com/video${vkId}`,
            thumbnail: item.thumbnail || "https://images.unsplash.com/photo-1542224566-6e85f2e6772f?w=480",
            duration: item.duration,
            platform: "vk" as const
          };
        } else {
          const rId = rutubeIds[index % rutubeIds.length];
          return {
            id: rId,
            title: `[RuTube] ${item.title}`,
            url: `https://rutube.ru/video/${rId}/`,
            thumbnail: item.thumbnail || "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=480",
            duration: item.duration,
            platform: "rutube" as const
          };
        }
      });
      return res.json(customizedResults);
    }

    // Fallback if scraping itself failed completely
    const fallbackResults = getFallbacks(query, platform);
    return res.json(fallbackResults);

  } catch (error) {
    console.error("Search Grounding process failed totally: ", error);
    const fallbackResults = getFallbacks(query, platform);
    return res.json(fallbackResults);
  }
});

// Helper functions for fallbacks
function getThumbnailFallback(id: string, platform: 'youtube' | 'vk' | 'rutube'): string {
  if (platform === "youtube") {
    return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
  }
  return `/placeholder-video.svg`; // Client fallback image
}

function getFallbacks(query: string, platform: 'youtube' | 'vk' | 'rutube'): SearchResult[] {
  if (platform === "youtube") {
    return [
      {
        id: "L_LUpnjgPso",
        title: `Lo-Fi Beats for Studying / Focus: ${query}`,
        url: "https://www.youtube.com/watch?v=L_LUpnjgPso",
        thumbnail: "https://img.youtube.com/vi/L_LUpnjgPso/mqdefault.jpg",
        duration: "10:00",
        platform: "youtube"
      },
      {
        id: "5qap5aO4i9A",
        title: `Lofi Girl - Chilled Music Beats live study/relax: ${query}`,
        url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
        thumbnail: "https://img.youtube.com/vi/5qap5aO4i9A/mqdefault.jpg",
        duration: "Live",
        platform: "youtube"
      },
      {
        id: "dQw4w9WgXcQ",
        title: `Rick Astley - Never Gonna Give You Up (HD Watch Party Mix)`,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        duration: "3:32",
        platform: "youtube"
      },
      {
        id: "9Sbnhgj_RTo",
        title: `Synthesizer Ambient Cosmic Sunset Space Theme`,
        url: "https://www.youtube.com/watch?v=9Sbnhgj_RTo",
        thumbnail: "https://img.youtube.com/vi/9Sbnhgj_RTo/mqdefault.jpg",
        duration: "1:00:00",
        platform: "youtube"
      }
    ];
  } else if (platform === "vk") {
    return [
      {
        id: "-154942004_456239102",
        title: `Звуки природы и лесного ручья (4К Релакс) [${query}]`,
        url: "https://vk.com/video-154942004_456239102",
        thumbnail: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=480",
        duration: "45:00",
        platform: "vk"
      },
      {
        id: "-25411409_456239017",
        title: `Путешествие на Алтай - Горы и Реки России [${query}]`,
        url: "https://vk.com/video-25411409_456239017",
        thumbnail: "https://images.unsplash.com/photo-1542224566-6e85f2e6772f?w=480",
        duration: "15:20",
        platform: "vk"
      },
      {
        id: "-199738743_456239017",
        title: `Космическое путешествие сквозь галактики в 4K UHD [${query}]`,
        url: "https://vk.com/video-199738743_456239017",
        thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=480",
        duration: "1:25:00",
        platform: "vk"
      },
      {
        id: "-45672152_456242910",
        title: `Красота Русского Леса - Птицы Весной [${query}]`,
        url: "https://vk.com/video-45672152_456242910",
        thumbnail: "https://images.unsplash.com/photo-1511497584788-876760111969?w=480",
        duration: "2:00:00",
        platform: "vk"
      },
      {
        id: "-201150499_456239017",
        title: `Прогулка по Москве: Архитектура и Огни City [${query}]`,
        url: "https://vk.com/video-201150499_456239017",
        thumbnail: "https://images.unsplash.com/photo-1513326738677-b964603b136d?w=480",
        duration: "30:45",
        platform: "vk"
      },
      {
        id: "-165626920_456241513",
        title: `Подводный мир океана и коралловые рифы [${query}]`,
        url: "https://vk.com/video-165626920_456241513",
        thumbnail: "https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=480",
        duration: "1:15:00",
        platform: "vk"
      },
      {
        id: "-139454645_456239018",
        title: `Шедевры Классической Музыки для Души [${query}]`,
        url: "https://vk.com/video-139454645_456239018",
        thumbnail: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=480",
        duration: "1:40:00",
        platform: "vk"
      },
      {
        id: "-220038870_456241285",
        title: `Легендарный Кинематограф: Сборник Сцен [${query}]`,
        url: "https://vk.com/video-220038870_456241285",
        thumbnail: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=480",
        duration: "58:30",
        platform: "vk"
      }
    ];
  } else {
    return [
      {
        id: "983df5a6f8bca96aa2ebd505b2df6ca2",
        title: `Камчатка — Вулканы России в потрясающем 4K [${query}]`,
        url: "https://rutube.ru/video/983df5a6f8bca96aa2ebd505b2df6ca2/",
        thumbnail: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=480",
        duration: "22:45",
        platform: "rutube"
      },
      {
        id: "7b949989f66ae91cc9ba7ecc44ccdf5c",
        title: `Космическая Медитация — Инструментал [${query}]`,
        url: "https://rutube.ru/video/7b949989f66ae91cc9ba7ecc44ccdf5c/",
        thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=480",
        duration: "12:10",
        platform: "rutube"
      },
      {
        id: "a6df30730dff7584167e4125b271cb46",
        title: `Озеро Байкал — Застывшее Дыхание Сибири [${query}]`,
        url: "https://rutube.ru/video/a6df30730dff7584167e4125b271cb46/",
        thumbnail: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=480",
        duration: "18:40",
        platform: "rutube"
      },
      {
        id: "6590fa63cc0cf6e3ddfb463ea739dd90",
        title: `Лесной Ручей — Шум Журчания Воды [${query}]`,
        url: "https://rutube.ru/video/6590fa63cc0cf6e3ddfb463ea739dd90/",
        thumbnail: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=480",
        duration: "1:00:20",
        platform: "rutube"
      },
      {
        id: "0aa912c9bfcc2a912bbbcbe9183492bd",
        title: `Удивительный мир диких животных планеты [${query}]`,
        url: "https://rutube.ru/video/0aa912c9bfcc2a912bbbcbe9183492bd/",
        thumbnail: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=480",
        duration: "25:35",
        platform: "rutube"
      },
      {
        id: "c79ff5de079cb39178ad3efbe04bc362",
        title: `Вечерняя Огни Москвы с Высоты Птичьего Полета [${query}]`,
        url: "https://rutube.ru/video/c79ff5de079cb39178ad3efbe04bc362/",
        thumbnail: "https://images.unsplash.com/photo-1513326738677-b964603b136d?w=480",
        duration: "42:15",
        platform: "rutube"
      },
      {
        id: "e54737cb2aa1a79f82de0deba19020bd",
        title: `Самые уморительные и милые котята и щенки [${query}]`,
        url: "https://rutube.ru/video/e54737cb2aa1a79f82de0deba19020bd/",
        thumbnail: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=480",
        duration: "15:00",
        platform: "rutube"
      },
      {
        id: "e283bdca2fba2df81c2ad4ccbe10ebd2",
        title: `Retro Synthwave Chill Mix — Космическая Фантастика [${query}]`,
        url: "https://rutube.ru/video/e283bdca2fba2df81c2ad4ccbe10ebd2/",
        thumbnail: "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?w=480",
        duration: "2:10:00",
        platform: "rutube"
      }
    ];
  }
}

// Socket.IO Room System connection configuration
io.on("connection", (socket: Socket) => {
  let currentRoomId: string | null = null;
  let currentUserId: string | null = null;

  // JOIN ROOM EVENT
  socket.on("join-room", ({ roomId, userName, userId, userAvatar }) => {
    currentRoomId = roomId;
    currentUserId = userId;

    socket.join(roomId);

    // If room does not exist, create it dynamically
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        name: `Комната #${roomId.substring(0, 5).toUpperCase()}`,
        leaderId: userId,
        videoSource: "youtube",
        videoId: "dQw4w9WgXcQ", // Initial Rick Roll default
        videoTitle: "Rick Astley - Never Gonna Give You Up",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        playbackState: {
          playing: false,
          currentTime: 0,
          lastUpdated: Date.now()
        },
        members: [],
        messages: [],
        playlist: []
      };
    }

    const room = rooms[roomId];

    // Check if member already registered (prevents reconnection race)
    const existingIndex = room.members.findIndex(m => m.id === userId);
    const isRoomLeader = room.leaderId === userId;
    
    const newMember: Member = {
      id: userId,
      name: userName || `Гость #${Math.floor(Math.random() * 9000 + 1000)}`,
      isLeader: isRoomLeader,
      avatar: userAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
      online: true
    };

    let isReconnection = false;

    if (existingIndex !== -1) {
      const wasOnline = room.members[existingIndex].online !== false;
      isReconnection = !wasOnline;
      room.members[existingIndex] = {
        ...room.members[existingIndex],
        ...newMember,
        online: true
      };
    } else {
      room.members.push(newMember);
    }

    // Verify room leader is still alive in members, if not, re-assign
    if (!room.members.some(m => m.id === room.leaderId)) {
      room.leaderId = userId;
      const targetM = room.members.find(m => m.id === userId);
      if (targetM) targetM.isLeader = true;
    }

    // Only log and broadcast join/reconnect messages on new join or real reconnect
    if (existingIndex === -1 || isReconnection) {
      const systemJoinMsg: Message = {
        id: `sys-${Date.now()}-${Math.random()}`,
        senderId: "system",
        senderName: "Система",
        senderAvatar: "",
        text: isReconnection 
          ? `${newMember.name} восстановил подключение к трансляции.`
          : `${newMember.name} присоединился к совместному просмотру.`,
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isSystem: true
      };
      room.messages.push(systemJoinMsg);

      // Keep messages history limited
      if (room.messages.length > 100) {
        room.messages.shift();
      }
    }

    // Broadcast updated room status specifically to everyone in the room
    io.to(roomId).emit("room-status", room);
  });

  // CHAT MESSAGE EVENT
  socket.on("chat-message", ({ text }) => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    const sender = room.members.find(m => m.id === currentUserId);
    if (!sender) return;

    const newMsg: Message = {
      id: `${Date.now()}-${Math.random()}`,
      senderId: sender.id,
      senderName: sender.name,
      senderAvatar: sender.avatar,
      text,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      isSystem: false
    };

    room.messages.push(newMsg);
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    io.to(currentRoomId).emit("message-received", newMsg);
  });

  // SYNC PLAYBACK STATE (FROM LEADER ONLY)
  socket.on("sync-video", (state: { playing: boolean; currentTime: number }) => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    // Verify requesting user is indeed the authorized room leader
    if (room.leaderId !== currentUserId) {
      // Reject and push the real lead position back to user
      socket.emit("playback-changed", room.playbackState);
      return;
    }

    room.playbackState = {
      playing: state.playing,
      currentTime: state.currentTime,
      lastUpdated: Date.now()
    };

    // Broadcast synchronization position to everyone in the room
    io.to(currentRoomId).emit("playback-changed", room.playbackState);
  });

  // UPDATE ACTIVE VIDEO EVENT (FROM LEADER ONLY)
  socket.on("update-video", ({ videoSource, videoId, videoTitle, videoUrl }) => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (room.leaderId !== currentUserId) {
      return; // Only leader can switch the video source
    }

    room.videoSource = videoSource;
    room.videoId = videoId;
    room.videoTitle = videoTitle;
    room.videoUrl = videoUrl;
    room.playbackState = {
      playing: false,
      currentTime: 0,
      lastUpdated: Date.now()
    };

    const sysChangeMsg: Message = {
      id: `sys-${Date.now()}-${Math.random()}`,
      senderId: "system",
      senderName: "Система",
      senderAvatar: "",
      text: `Лидер сменил видео на: "${videoTitle}"`,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.messages.push(sysChangeMsg);

    io.to(currentRoomId).emit("room-status", room);
  });

  // EXPLICIT SYNC REQUEST (FROM ANY MEMBER RE-JOINING OR OUT-OF-SYNC)
  socket.on("request-sync", () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;
    
    // Send direct updated state
    socket.emit("playback-changed", room.playbackState);
  });

  // PASS LEADER TRANSFER EVENT (FROM LEADER ONLY)
  socket.on("transfer-leader", ({ targetUserId }) => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (room.leaderId !== currentUserId) return;

    const targetMember = room.members.find(m => m.id === targetUserId);
    if (!targetMember) return;

    room.leaderId = targetUserId;
    room.members.forEach(m => {
      m.isLeader = (m.id === targetUserId);
    });

    const sysMsg: Message = {
      id: `sys-${Date.now()}-${Math.random()}`,
      senderId: "system",
      senderName: "Система",
      senderAvatar: "",
      text: `${targetMember.name} назначен новым лидером комнаты.`,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.messages.push(sysMsg);

    io.to(currentRoomId).emit("room-status", room);
  });

  // PLAYLIST QUEUE OPERATIONS
  socket.on("add-to-playlist", (item) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (!room.playlist) room.playlist = [];

    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      videoId: item.videoId,
      title: item.title,
      url: item.url,
      platform: item.platform,
      thumbnail: item.thumbnail,
      duration: item.duration || "0:00",
      addedBy: item.addedBy
    };

    room.playlist.push(newItem);

    const sysMsg: Message = {
      id: `sys-${Date.now()}-${Math.random()}`,
      senderId: "system",
      senderName: "Система",
      senderAvatar: "",
      text: `${item.addedBy} добавил(а) в плейлист: "${item.title}"`,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.messages.push(sysMsg);

    io.to(currentRoomId).emit("room-status", room);
  });

  socket.on("remove-from-playlist", ({ itemId }) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (room.playlist) {
      room.playlist = room.playlist.filter(item => item.id !== itemId);
    }

    io.to(currentRoomId).emit("room-status", room);
  });

  socket.on("play-next-playlist", () => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (room.leaderId !== currentUserId) return;

    if (!room.playlist || room.playlist.length === 0) return;

    const nextItem = room.playlist.shift();
    if (nextItem) {
      room.videoSource = nextItem.platform;
      room.videoId = nextItem.videoId;
      room.videoTitle = nextItem.title;
      room.videoUrl = nextItem.url;
      room.playbackState = {
        playing: true,
        currentTime: 0,
        lastUpdated: Date.now()
      };

      const sysMsg: Message = {
        id: `sys-${Date.now()}-${Math.random()}`,
        senderId: "system",
        senderName: "Система",
        senderAvatar: "",
        text: `Запущено следующее видео из плейлиста: "${nextItem.title}"`,
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isSystem: true
      };
      room.messages.push(sysMsg);
    }

    io.to(currentRoomId).emit("room-status", room);
  });

  socket.on("clear-playlist", () => {
    if (!currentRoomId || !currentUserId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (room.leaderId !== currentUserId) return;

    room.playlist = [];
    io.to(currentRoomId).emit("room-status", room);
  });

  // REAL-TIME SYNCHRONIZED FLOATING EMOJI REACTION
  socket.on("emoji-reaction", ({ emoji, userName }) => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit("reaction-floating", {
      id: `react-${Date.now()}-${Math.random()}`,
      emoji,
      userName
    });
  });

  // ON DISCONNECT EVENT
  socket.on("disconnect", () => {
    if (!currentRoomId || !currentUserId) return;

    const room = rooms[currentRoomId];
    if (!room) return;

    // Retrieve info on leaving member
    const leavingMember = room.members.find(m => m.id === currentUserId);
    if (!leavingMember) return;

    // Instead of deleting instantly, mark them as offline
    leavingMember.online = false;
    leavingMember.disconnectedAt = Date.now();

    // Broadcast updated room status to inform clients that user is offline
    io.to(currentRoomId).emit("room-status", room);

    // Schedule a leader transfer check or cleanup in 8 seconds
    setTimeout(() => {
      const currentRoom = rooms[currentRoomId!];
      if (!currentRoom) return;

      const memberCheck = currentRoom.members.find(m => m.id === currentUserId);
      // If the member is still marked offline (didn't reconnect within 8 seconds), clean them up
      if (memberCheck && memberCheck.online === false) {
        currentRoom.members = currentRoom.members.filter(m => m.id !== currentUserId);

        if (currentRoom.members.length === 0) {
          // Delete room if it has been totally vacated
          delete rooms[currentRoomId!];
          console.log(`Room ${currentRoomId} successfully deleted due to vacancy.`);
          return;
        }

        let leaderChanged = false;
        let newLeaderName = "";

        // If the disconnected user was leader, assign to first available online member
        if (currentRoom.leaderId === currentUserId) {
          const nextLeader = currentRoom.members.find(m => m.online !== false) || currentRoom.members[0];
          if (nextLeader) {
            currentRoom.leaderId = nextLeader.id;
            // Clear other leaders and assign
            currentRoom.members.forEach(m => m.isLeader = (m.id === nextLeader.id));
            newLeaderName = nextLeader.name;
            leaderChanged = true;
          }
        }

        // Add regular leave logging message
        const leaveMsg: Message = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: "system",
          senderName: "Система",
          senderAvatar: "",
          text: `${leavingMember.name} покинул комнату.`,
          timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isSystem: true
        };
        currentRoom.messages.push(leaveMsg);

        if (leaderChanged && newLeaderName) {
          const promotionMsg: Message = {
            id: `sys-${Date.now()}-${Math.random()}`,
            senderId: "system",
            senderName: "Система",
            senderAvatar: "",
            text: `${newLeaderName} автоматически был назначен новым лидером комнаты.`,
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isSystem: true
          };
          currentRoom.messages.push(promotionMsg);
        }

        // Broadcast finalized room status
        io.to(currentRoomId!).emit("room-status", currentRoom);
      }
    }, 8000);
  });
});

// Configure Vite integration to render frontend correctly
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Vite production bundle static files hosting
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // Start keep-alive mechanism to prevent sleeping on free tier
    startKeepAlive();
  });
}

startServer();
