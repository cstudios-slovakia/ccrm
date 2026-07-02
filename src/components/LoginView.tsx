import React, { useState } from "react";
import { LogIn, Key, Mail, Terminal, AlertCircle, CheckCircle } from "lucide-react";
import type { UserProfile } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import LightRays from "./LightRays";

interface LoginViewProps {
  users: UserProfile[];
  onLoginSuccess: (user: UserProfile) => void;
  systemName: string;
  systemLanguage: Language;
  isDemoMode: boolean;
  isModal?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({ users, onLoginSuccess, systemName, systemLanguage, isDemoMode, isModal }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showResetInfo, setShowResetInfo] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  // --- 11x11 Minesweeper Toy Game ---
  const BOARD_SIZE = 11;
  const MINE_COUNT = 15;

  interface MinesweeperCell {
    isMine: boolean;
    isRevealed: boolean;
    isFlagged: boolean;
    neighborMines: number;
  }

  const createEmptyBoard = (): MinesweeperCell[] => {
    return Array(BOARD_SIZE * BOARD_SIZE).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      neighborMines: 0,
    }));
  };

  const [board, setBoard] = useState<MinesweeperCell[]>(() => createEmptyBoard());
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');
  const [firstClick, setFirstClick] = useState(true);
  const [minesRemaining, setMinesRemaining] = useState(MINE_COUNT);

  const initializeMines = (startIdx: number, currentBoard: MinesweeperCell[]): MinesweeperCell[] => {
    const newBoard = currentBoard.map(c => ({ ...c }));
    let placedMines = 0;
    while (placedMines < MINE_COUNT) {
      const randomIdx = Math.floor(Math.random() * (BOARD_SIZE * BOARD_SIZE));
      if (randomIdx !== startIdx && !newBoard[randomIdx].isMine) {
        newBoard[randomIdx].isMine = true;
        placedMines++;
      }
    }

    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      if (newBoard[i].isMine) continue;
      let count = 0;
      const row = Math.floor(i / BOARD_SIZE);
      const col = i % BOARD_SIZE;

      for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
          const nr = row + r;
          const nc = col + c;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
            if (newBoard[nr * BOARD_SIZE + nc].isMine) {
              count++;
            }
          }
        }
      }
      newBoard[i].neighborMines = count;
    }

    return newBoard;
  };

  const handleCellClick = (index: number) => {
    if (gameState !== 'playing') {
      resetGame();
      return;
    }
    
    let currentBoard = [...board];
    if (currentBoard[index].isFlagged || currentBoard[index].isRevealed) return;

    if (firstClick) {
      currentBoard = initializeMines(index, currentBoard);
      setFirstClick(false);
    }

    if (currentBoard[index].isMine) {
      currentBoard = currentBoard.map(c => c.isMine ? { ...c, isRevealed: true } : c);
      setBoard(currentBoard);
      setGameState('lost');
      return;
    }

    const queue = [index];
    const visited = new Set<number>();
    
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      currentBoard[curr].isRevealed = true;

      if (currentBoard[curr].neighborMines === 0) {
        const row = Math.floor(curr / BOARD_SIZE);
        const col = curr % BOARD_SIZE;

        for (let r = -1; r <= 1; r++) {
          for (let c = -1; c <= 1; c++) {
            const nr = row + r;
            const nc = col + c;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
              const neighborIdx = nr * BOARD_SIZE + nc;
              if (!currentBoard[neighborIdx].isRevealed && !currentBoard[neighborIdx].isFlagged) {
                queue.push(neighborIdx);
              }
            }
          }
        }
      }
    }

    const hasWon = currentBoard.every(c => c.isMine ? !c.isRevealed : c.isRevealed);
    if (hasWon) {
      setGameState('won');
      setTimeout(() => {
        setShowSuccessOverlay(true);
        const adminUser = users.find(u => u.role.toLowerCase() === "admin") || users[0];
        if (adminUser) {
          setEmail(adminUser.email);
          if (isDemoMode) setPassword("password");
        }
      }, 400);
    }
    setBoard(currentBoard);
  };

  const handleCellRightClick = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    if (gameState !== 'playing' || board[index].isRevealed) return;

    const newBoard = [...board];
    const isFlagged = !newBoard[index].isFlagged;
    newBoard[index].isFlagged = isFlagged;
    setBoard(newBoard);
    setMinesRemaining(prev => prev + (isFlagged ? -1 : 1));
  };

  const resetGame = () => {
    setBoard(createEmptyBoard());
    setGameState('playing');
    setFirstClick(true);
    setMinesRemaining(MINE_COUNT);
  };

  // Verify credentials server-side. Passwords are never sent to or compared in
  // the browser; api/login.php checks the bcrypt hash and opens a session.
  const authenticate = async (loginEmail: string, loginPassword: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success && data.user) {
        onLoginSuccess(data.user as UserProfile);
        return;
      }
      setError(getTranslation(systemLanguage, "login.error_pass"));
    } catch (err) {
      setError(getTranslation(systemLanguage, "login.error_pass"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    authenticate(email, password);
  };

  const handleQuickLogin = (user: UserProfile) => {
    setEmail(user.email);
    setPassword("password");
    authenticate(user.email, "password");
  };

  return (
    <div className={isModal ? "w-full flex items-center justify-center bg-white border border-slate-200/50 rounded-[32px] shadow-2xl p-6 md:p-12 relative overflow-hidden select-none font-sans" : "min-h-screen w-full flex items-center justify-center lg:justify-end bg-[#0f111a] p-6 md:p-12 lg:pr-32 relative overflow-hidden select-none font-sans"}>
      
      {/* Custom Embedded Keyframes for 3D Node Flip & Aurora Success Flash */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float-blob-1 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(50px, -70px) scale(1.1); }
          66% { transform: translate(-30px, 40px) scale(0.95); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-blob-2 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-60px, 50px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-blob-3 {
          0% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(70px, -30px) scale(1.05); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes 3d-flip {
          0% { transform: perspective(400px) rotateY(0deg) scale(1); }
          50% { transform: perspective(400px) rotateY(90deg) scale(1.08); }
          100% { transform: perspective(400px) rotateY(180deg) scale(1); }
        }
        @keyframes pulse-success-glow {
          0%, 100% { opacity: 0.15; filter: blur(80px); }
          50% { opacity: 0.35; filter: blur(60px); }
        }
        .aurora-blob-1 { animation: float-blob-1 15s infinite ease-in-out; }
        .aurora-blob-2 { animation: float-blob-2 18s infinite ease-in-out; }
        .aurora-blob-3 { animation: float-blob-3 16s infinite ease-in-out; }
        
        .node-3d-flip {
          animation: 3d-flip 0.38s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aurora-solved-glow {
          animation: pulse-success-glow 3s infinite ease-in-out;
        }
        .node-spring-transition {
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}} />

      {/* Animated 3D Shader Background */}
      {!isModal && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <LightRays
            raysOrigin="left"
            raysColor="#ffddbc"
            raysSpeed={1}
            lightSpread={1.4}
            rayLength={3.2}
            pulsating={false}
            fadeDistance={1.9}
            saturation={1}
            followMouse
            mouseInfluence={0.1}
            noiseAmount={0}
            distortion={0}
          />
        </div>
      )}

      {/* FULLSCREEN PUZZLE DECIPHERED SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-6 select-none animate-in fade-in zoom-in duration-500">
          <div className="p-8 max-w-sm rounded-[36px] bg-white border border-slate-200/80 shadow-2xl flex flex-col items-center text-center space-y-5 animate-in slide-in-from-bottom-8 duration-500 delay-100">
            <div className="h-16 w-16 rounded-3xl bg-emerald-50 flex items-center justify-center border border-emerald-200 shadow-md shadow-emerald-500/10">
              <CheckCircle className="h-10 w-10 text-emerald-500 animate-bounce" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-md font-heading font-black tracking-tight text-slate-900 uppercase">
                {getTranslation(systemLanguage, "login.success")}
              </h3>
              <p className="text-[10px] text-slate-450 uppercase font-black tracking-widest leading-normal">
                {getTranslation(systemLanguage, "login.success_desc")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccessOverlay(false)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-indigo-600/25 shrink-0"
            >
              {getTranslation(systemLanguage, "login.success_btn")}
            </button>
          </div>
        </div>
      )}

      {/* LEFT AREA: 11x11 Minesweeper */}
      {!isModal && (
        <div className="flex-1 hidden lg:flex flex-col justify-center items-center relative z-10 pr-16 space-y-4 animate-fade-in duration-500">
          {/* 11x11 Grid Container */}
          <div className="grid grid-cols-11 gap-0 w-full max-w-[340px] select-none">
            {board.map((cell, index) => {
              let cellContent = "";
              let colorClass = "text-slate-700";
              
              if (cell.isRevealed) {
                if (cell.isMine) {
                  cellContent = "💣";
                } else if (cell.neighborMines > 0) {
                  cellContent = cell.neighborMines.toString();
                  const colors = [
                    "", // 0
                    "text-blue-600 font-black", // 1
                    "text-emerald-600 font-black", // 2
                    "text-rose-600 font-black", // 3
                    "text-purple-600 font-black", // 4
                    "text-amber-600 font-black", // 5
                    "text-cyan-605 font-black", // 6
                    "text-red-705 font-black", // 7
                    "text-slate-600 font-black", // 8
                  ];
                  colorClass = colors[cell.neighborMines] || "text-slate-750";
                }
              } else if (cell.isFlagged) {
                cellContent = "🚩";
              }

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleCellClick(index)}
                  onContextMenu={(e) => handleCellRightClick(e, index)}
                  className={`aspect-square w-full rounded-none flex items-center justify-center text-[10.5px] font-black transition-all duration-150 outline-none border-[0.5px] border-white/10 cursor-pointer ${
                    cell.isRevealed
                      ? cell.isMine 
                        ? "bg-rose-600 border-transparent text-white shadow-[inset_0_2.5px_4.5px_rgba(0,0,0,0.45)]"
                        : "bg-white/95 border-transparent text-slate-800 shadow-[inset_0_2.5px_4.5px_rgba(0,0,0,0.35)]"
                      : "bg-transparent hover:bg-white/5 active:scale-95 text-white"
                  }`}
                  style={{
                    borderRadius: '0px'
                  }}
                >
                  <span className={colorClass}>{cellContent}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[9px] font-extrabold text-white/60 uppercase tracking-widest text-center h-4 drop-shadow">
            {gameState === 'won' 
              ? "🎉 DECRYPTED! (CLICK ANY CELL TO RESTART)" 
              : gameState === 'lost' 
              ? "💥 BOOM! (CLICK ANY CELL TO RESTART)" 
              : `💣 ${minesRemaining} MINES | RIGHT-CLICK TO FLAG`}
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Light-themed glass login card panel */}
      <div className={isModal ? "w-full relative z-10" : "flex-1 max-w-[430px] h-full flex items-center justify-center lg:justify-end relative z-10 w-full ml-auto"}>
        <div className="w-full bg-white/80 border border-slate-200/80 rounded-[32px] shadow-2xl backdrop-blur-xl p-8 transition-all duration-300">
          
          {/* Core System Brand */}
          <div className="flex flex-col items-center justify-center text-center space-y-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Terminal className="h-6 w-6 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-black text-slate-900 tracking-tight uppercase">
                {systemName} {getTranslation(systemLanguage, "login.title")}
              </h2>
              <p className="text-[10px] text-slate-505 font-extrabold uppercase tracking-widest mt-1">
                {getTranslation(systemLanguage, "login.subtitle")}
              </p>
            </div>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">{getTranslation(systemLanguage, "login.email")}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. erik@crm.com"
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-slate-250 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">{getTranslation(systemLanguage, "login.password")}</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-slate-250 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Error Alert Display */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-850 text-xs font-semibold animate-shake">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 hover:scale-[1.01] active:scale-[0.99]"
            >
              <LogIn className="h-4 w-4 stroke-[2.5]" /> {getTranslation(systemLanguage, "login.authenticate")}
            </button>
          </form>

          {isDemoMode ? (
            <>
              {/* Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative px-3 bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {getTranslation(systemLanguage, "login.quick_presets")}
                </span>
              </div>

              {/* Quick Swapper Cards */}
              <div className="space-y-2">
                {users.map((user) => {
                  const roleColor = user.role.toLowerCase() === "admin" ? "#f43f5e" : "#3b82f6";
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => handleQuickLogin(user)}
                      className="w-full p-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 text-left transition-all flex items-center justify-between group active:scale-95 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="h-8 w-8 rounded-xl font-heading font-black text-[10px] flex items-center justify-center border transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: `${user.color}15`,
                            color: user.color,
                            borderColor: `${user.color}35`
                          }}
                        >
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{user.name}</span>
                          <span className="text-[10px] text-slate-450 font-medium">{user.email}</span>
                        </div>
                      </div>
                      
                      <span 
                        className="px-2.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: `${roleColor}10`,
                          color: roleColor,
                          borderColor: `${roleColor}25`
                        }}
                      >
                        {user.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setShowResetInfo(!showResetInfo)}
                className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                {systemLanguage === "sk" ? "Zabudli ste heslo?" : systemLanguage === "hu" ? "Elfelejtette a jelszavát?" : "Forgot Password?"}
              </button>
              {showResetInfo && (
                <div className="mt-3 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 text-slate-600 text-[10px] font-semibold text-left leading-normal animate-in fade-in slide-in-from-top-4 duration-300">
                  {systemLanguage === "sk" ? (
                    <span>Pre obnovenie prístupu kontaktujte prosím správcu databázy CCRM, alebo manuálne zmeňte hodnotu stĺpca `password_hash` pre zvoleného používateľa priamo v tabuľke `users` vášho MySQL servera.</span>
                  ) : systemLanguage === "hu" ? (
                    <span>A hozzáférés visszaállításához forduljon a CCRM adatbázis-adminisztrátorához, vagy módosítsa manuálisan a `password_hash` oszlop értékét a `users` táblában a MySQL-kiszolgálón.</span>
                  ) : (
                    <span>To restore access, please contact your CCRM database administrator, or manually update the `password_hash` column for the targeted user row directly in the `users` table of your MySQL database.</span>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
