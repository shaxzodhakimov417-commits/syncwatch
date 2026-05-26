import { Tv, RefreshCw } from 'lucide-react';

interface LoadingScreenProps {
  attempts?: number;
  error?: string;
  onRetry?: () => void;
}

export default function LoadingScreen({ attempts = 0, error = '', onRetry }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6 max-w-md">
        {/* Logo */}
        <div className="p-4 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-xl shadow-indigo-600/20 animate-pulse">
          <Tv className="w-12 h-12 text-white" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent mb-2">
            SYNC<span className="text-indigo-500">WATCH</span>
          </h1>
          <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest font-mono">
            Синхронизация • КиноЧат
          </p>
        </div>

        {/* Error message or loading spinner */}
        {error ? (
          <div className="flex flex-col items-center gap-4">
            <div className="px-6 py-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm text-center">
              <p className="font-semibold mb-2">⚠️ Ошибка подключения</p>
              <p className="text-xs text-red-300">{error}</p>
            </div>
            
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Попробовать снова
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-400 font-mono animate-pulse">
              Подключение к серверу...
            </p>
            {attempts > 0 && (
              <p className="text-xs text-zinc-600 text-center">
                Попытка {attempts}/10
              </p>
            )}
            <p className="text-xs text-zinc-600 text-center max-w-xs">
              Первый запуск может занять 30-60 секунд. Пожалуйста, подождите.
            </p>
          </div>
        )}

        {/* Progress dots (only show when loading, not on error) */}
        {!error && (
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
