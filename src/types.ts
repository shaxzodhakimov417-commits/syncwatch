export interface PlaybackState {
  playing: boolean;
  currentTime: number; // in seconds
  lastUpdated: number; // local server timestamp
}

export interface Member {
  id: string;
  name: string;
  isLeader: boolean;
  avatar: string;
  online?: boolean;
  disconnectedAt?: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
  isSystem: boolean;
}

export interface Room {
  id: string;
  name: string;
  leaderId: string;
  videoSource: 'youtube' | 'vk' | 'rutube' | 'direct';
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  playbackState: PlaybackState;
  members: Member[];
  messages: Message[];
  playlist?: PlaylistItem[];
}

export interface PlaylistItem {
  id: string;
  videoId: string;
  title: string;
  url: string;
  platform: 'youtube' | 'vk' | 'rutube' | 'direct';
  thumbnail?: string;
  duration?: string;
  addedBy: string;
}

export interface SearchResult {
  id: string; // video ID or full embed helper
  title: string;
  thumbnail: string;
  url: string;
  duration?: string;
  platform: 'youtube' | 'vk' | 'rutube' | 'direct';
}
