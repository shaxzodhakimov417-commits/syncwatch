import { Crown, Users, Award } from 'lucide-react';
import { Member } from '../types';

interface MembersListProps {
  members: Member[];
  leaderId: string;
  currentUserId: string;
  socket: any;
}

export default function MembersList({
  members,
  leaderId,
  currentUserId,
  socket
}: MembersListProps) {
  const isLeader = currentUserId === leaderId;

  const handleLeaderTransfer = (member: Member) => {
    if (!isLeader) return;
    if (member.id === currentUserId) return;

    const confirmTransfer = window.confirm(`Вы уверены, что хотите передать роль Лидера участнику ${member.name}?`);
    if (confirmTransfer) {
      socket.emit("transfer-leader", { targetUserId: member.id });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] border border-white/10 rounded-2xl p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-indigo-400" />
        <h4 className="text-sm font-semibold text-white">Участники просмотра ({members.length})</h4>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[300px] md:max-h-full pr-1">
        {members.map((member) => (
          <div
            key={member.id}
            onClick={() => {
              if (member.online !== false) {
                handleLeaderTransfer(member);
              }
            }}
            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
              member.online === false 
                ? 'opacity-40 bg-zinc-950/20 border-white/5 border-dashed'
                : member.id === leaderId
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-zinc-950/40 border-transparent hover:border-white/5'
            } ${isLeader && member.id !== currentUserId && member.online !== false ? 'cursor-pointer hover:bg-zinc-950/80 group' : ''}`}
            title={isLeader && member.id !== currentUserId && member.online !== false ? "Кликните для передачи лидерства" : ""}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={member.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.id}`}
                  alt={member.name}
                  referrerPolicy="no-referrer"
                  className="w-8.5 h-8.5 rounded-lg border border-white/10"
                />
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${
                  member.online === false
                    ? 'bg-zinc-600'
                    : member.id === leaderId 
                      ? 'bg-amber-400 animate-pulse' 
                      : 'bg-emerald-500'
                }`} />
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5 font-sans leading-none">
                  {member.name}
                  {member.id === currentUserId && (
                    <span className="text-[10px] text-zinc-400 px-1 py-0.5 rounded bg-zinc-800 border border-white/5 text-[9px] uppercase font-bold font-mono">
                      Вы
                    </span>
                  )}
                  {member.online === false && (
                    <span className="text-[9px] text-zinc-500 font-medium px-1.5 py-0.5 rounded bg-black border border-white/5">
                      Вне сети
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  ID: {member.id.substring(0, 8)}
                </p>
              </div>
            </div>

            {/* Display Crown or Swap indicators */}
            <div className="flex items-center gap-2">
              {member.id === leaderId ? (
                <div className="p-1 px-1.5 bg-amber-500/20 border border-amber-500/35 rounded-md text-amber-400 flex items-center gap-1 text-[9px] uppercase font-bold font-sans">
                  <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span>Лидер</span>
                </div>
              ) : isLeader ? (
                <div className="opacity-0 group-hover:opacity-100 p-1 bg-indigo-600/20 border border-indigo-500/20 rounded text-indigo-400 text-[9px] flex items-center gap-1 font-semibold uppercase tracking-wider transition-opacity select-none">
                  <Award className="w-3 h-3 text-indigo-400" />
                  <span>Назначить</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      
      {isLeader && members.length > 1 && (
        <p className="text-[10px] text-zinc-500 text-center font-sans mt-4 border-t border-white/5 pt-3 leading-relaxed">
          💡 Вы можете передать роль Лидера, просто кликнув на любого участника в списке выше.
        </p>
      )}
    </div>
  );
}
