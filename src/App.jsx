import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  Gamepad2, User, Copy, Loader2, X, Circle, Trophy, Hand, Scissors, Square, Grid3X3, Palette, LayoutGrid, Sparkles, Volume2, RefreshCw, LogOut, Check
} from 'lucide-react';

// --- AUDIO ENGINE ---
const playSound = (type) => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const now = ctx.currentTime;

  const createOsc = (freq, type, startTime, duration) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    gain.gain.setValueAtTime(0.1, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.stop(startTime + duration);
  };

  if (type === 'click') {
    createOsc(600, 'sine', now, 0.1);
  } else if (type === 'move') {
    createOsc(300, 'triangle', now, 0.1);
    createOsc(150, 'sine', now, 0.15);
  } else if (type === 'win') {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => createOsc(f, 'triangle', now + i * 0.1, 0.3));
  } else if (type === 'lose') {
    [392.00, 369.99, 311.13, 261.63].forEach((f, i) => createOsc(f, 'sawtooth', now + i * 0.15, 0.4));
  } else if (type === 'draw') {
    createOsc(400, 'square', now, 0.2);
    createOsc(400, 'square', now + 0.2, 0.2);
  } else if (type === 'notify') {
    createOsc(800, 'sine', now, 0.1);
    createOsc(1200, 'sine', now + 0.1, 0.1);
  } else if (type === 'copy') {
    createOsc(1000, 'sine', now, 0.05);
    createOsc(1500, 'sine', now + 0.05, 0.05);
  }
};

// --- FIREBASE CONFIGURATION ---
const getFirebaseConfig = () => {
  // 1. Try AI Preview Environment
  try {
    if (typeof __firebase_config !== 'undefined') {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.log("Local environment detected");
  }
  
  // 2. Production / Local Fallback
  // Note: If using Vite locally with .env files, you can uncomment the import.meta block below.
  
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
  }
  

  // 3. Manual Key Fallback (Paste your keys here for local testing)
  // return {
  //   apiKey: "PASTE_YOUR_API_KEY_HERE", 
  //   authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
  //   projectId: "PASTE_YOUR_PROJECT_ID_HERE",
  //   storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
  //   messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  //   appId: "PASTE_YOUR_APP_ID_HERE"
  // };
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- THEME CONFIGURATION ---
const THEMES = {
  blue: { bg: 'bg-blue-600', text: 'text-blue-600', light: 'bg-blue-50', border: 'border-blue-500', ring: 'ring-blue-500', hover: 'hover:bg-blue-50' },
  red: { bg: 'bg-rose-600', text: 'text-rose-600', light: 'bg-rose-50', border: 'border-rose-500', ring: 'ring-rose-500', hover: 'hover:bg-rose-50' },
  green: { bg: 'bg-emerald-600', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-500', ring: 'ring-emerald-500', hover: 'hover:bg-emerald-50' },
  yellow: { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-500', ring: 'ring-amber-500', hover: 'hover:bg-amber-50' },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [game, setGame] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [selectedGame, setSelectedGame] = useState('tictactoe'); 
  const [rpsRounds, setRpsRounds] = useState(3);
  const [dotsGrid, setDotsGrid] = useState({r: 3, c: 3});
  
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('blue');

  // 1. Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setPlayerName(`Player ${u.uid.slice(0,3)}`); 
    });
    return () => unsubscribe();
  }, []);

  // 2. Game Listener
  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = onSnapshot(doc(db, 'games', roomId), (snap) => {
      if (snap.exists()) {
        setGame(snap.data());
      } else { 
        setGame(null);
        setRoomId('');
        setView('lobby');
        playSound('lose'); 
        setError("Room Closed. Opponent left."); 
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  // 3. Sound Effects & Winner Listener
  const lastWinnerRef = useRef(null);
  useEffect(() => {
    if (game?.winner && game.winner !== lastWinnerRef.current) {
      lastWinnerRef.current = game.winner;
      if (game.winner === 'Draw') {
        playSound('draw');
      } else {
        const isHost = user.uid === game.host;
        let iWon = false;
        if (game.type === 'tictactoe') iWon = (game.winner === 'X' && isHost) || (game.winner === 'O' && !isHost);
        else iWon = (game.winner === 'Host' && isHost) || (game.winner === 'Guest' && !isHost);
        playSound(iWon ? 'win' : 'lose');
      }
    }
    if (!game?.winner) lastWinnerRef.current = null;
  }, [game?.winner, user?.uid, game?.host, game?.type]);

  // 4. Auto-Dismiss Errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // --- Actions ---

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    playSound('copy');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createGame = async () => {
    if (!user) return;
    playSound('click');
    setLoading(true);
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    let initialState = {
      type: selectedGame,
      host: user.uid,
      hostName: playerName,
      hostColor: playerColor,
      guest: null,
      guestName: null,
      guestColor: null,
      winner: null,
      turn: 'host',
      created: Date.now(),
      rematch: { host: false, guest: false } 
    };

    if (selectedGame === 'tictactoe') initialState.board = Array(9).fill(null);
    else if (selectedGame === 'rps') {
      initialState.moves = { host: null, guest: null };
      initialState.scores = { host: 0, guest: 0 };
      initialState.maxRounds = rpsRounds;
      initialState.currentRound = 1;
      initialState.roundWinner = null;
    } else if (selectedGame === 'dots') {
      const { r, c } = dotsGrid;
      initialState.gridSize = { r, c };
      initialState.hLines = Array((r + 1) * c).fill(false);
      initialState.vLines = Array(r * (c + 1)).fill(false);
      initialState.boxes = Array(r * c).fill(null);
      initialState.scores = { host: 0, guest: 0 };
    } else if (selectedGame === 'connect4') {
      initialState.board = Array(42).fill(null);
    }
    
    await setDoc(doc(db, 'games', newId), initialState);
    setRoomId(newId);
    setView('game');
    setLoading(false);
  };

  const joinGame = async () => {
    if (!user || !joinId) return;
    playSound('click');
    setLoading(true);
    const id = joinId.toUpperCase();
    const gameRef = doc(db, 'games', id);
    const snap = await getDoc(gameRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.hostColor === playerColor) {
        setError(`Color conflict! Host is using ${playerColor.toUpperCase()}.`);
        setLoading(false);
        return;
      }
      if (!data.guest && data.host !== user.uid) {
        await updateDoc(doc(db, 'games', id), { 
          guest: user.uid,
          guestName: playerName,
          guestColor: playerColor
        });
      }
      setRoomId(id);
      setView('game');
    } else {
      setError("Room not found!");
    }
    setLoading(false);
  };

  const abandonGame = async () => {
    playSound('click');
    try { await deleteDoc(doc(db, 'games', roomId)); } catch (err) { console.error(err); }
  };

  const handleRematch = async () => {
    playSound('click');
    const role = user.uid === game.host ? 'host' : 'guest';
    const opponentRole = role === 'host' ? 'guest' : 'host';
    const currentRematch = game.rematch || { host: false, guest: false };
    
    if (currentRematch[opponentRole]) {
      let resetUpdates = {
        winner: null,
        turn: game.turn === 'host' ? 'guest' : 'host', 
        rematch: { host: false, guest: false }
      };
      if (game.type === 'tictactoe') resetUpdates.board = Array(9).fill(null);
      else if (game.type === 'connect4') resetUpdates.board = Array(42).fill(null);
      else if (game.type === 'rps') {
        resetUpdates.moves = { host: null, guest: null };
        resetUpdates.roundWinner = null;
        resetUpdates.currentRound = 1;
        resetUpdates.scores = { host: 0, guest: 0 }; 
      } else if (game.type === 'dots') {
        const { r, c } = game.gridSize;
        resetUpdates.hLines = Array((r + 1) * c).fill(false);
        resetUpdates.vLines = Array(r * (c + 1)).fill(false);
        resetUpdates.boxes = Array(r * c).fill(null);
        resetUpdates.scores = { host: 0, guest: 0 };
      }
      await updateDoc(doc(db, 'games', roomId), resetUpdates);
      playSound('notify');
    } else {
      await updateDoc(doc(db, 'games', roomId), { rematch: { ...currentRematch, [role]: true } });
    }
  };

  // --- Game Logic ---
  const playTicTacToe = async (index) => {
    if (game.winner || game.turn !== (user.uid === game.host ? 'host' : 'guest') || game.board[index]) return;
    playSound('move');
    const symbol = user.uid === game.host ? 'X' : 'O';
    const newBoard = [...game.board]; newBoard[index] = symbol;
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    let winner = null;
    for (let [a,b,c] of lines) if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) winner = symbol;
    if (!winner && newBoard.every(c => c)) winner = 'Draw';
    await updateDoc(doc(db, 'games', roomId), { board: newBoard, turn: game.turn === 'host' ? 'guest' : 'host', winner });
  };

  const playConnect4 = async (colIndex) => {
    const role = user.uid === game.host ? 'host' : 'guest';
    if (game.winner || game.turn !== role) return;
    let targetIndex = -1;
    for (let r = 5; r >= 0; r--) {
      if (!game.board[r * 7 + colIndex]) { targetIndex = r * 7 + colIndex; break; }
    }
    if (targetIndex === -1) return; 
    playSound('move');
    const newBoard = [...game.board]; newBoard[targetIndex] = role;
    const checkWin = () => {
      const directions = [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: -1 }];
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 7; c++) {
          const idx = r * 7 + c; const piece = newBoard[idx];
          if (!piece) continue;
          for (let { r: dr, c: dc } of directions) {
            if (r + 3 * dr < 6 && r + 3 * dr >= 0 && c + 3 * dc < 7 && c + 3 * dc >= 0 &&
              newBoard[(r + 1 * dr) * 7 + (c + 1 * dc)] === piece &&
              newBoard[(r + 2 * dr) * 7 + (c + 2 * dc)] === piece &&
              newBoard[(r + 3 * dr) * 7 + (c + 3 * dc)] === piece
            ) return piece === 'host' ? 'Host' : 'Guest';
          }
        }
      }
      return null;
    };
    let winner = checkWin();
    if (!winner && newBoard.every(c => c)) winner = 'Draw';
    await updateDoc(doc(db, 'games', roomId), { board: newBoard, turn: role === 'host' ? 'guest' : 'host', winner });
  };

  const playRPS = async (move) => {
    const role = user.uid === game.host ? 'host' : 'guest';
    if (game.moves[role] || game.roundWinner || game.winner) return;
    playSound('click');
    const newMoves = { ...game.moves, [role]: move };
    if (newMoves.host && newMoves.guest) {
      let rWinner = null; const { host, guest } = newMoves;
      if (host === guest) rWinner = 'Draw';
      else if ((host === 'rock' && guest === 'scissors') || (host === 'paper' && guest === 'rock') || (host === 'scissors' && guest === 'paper')) rWinner = 'host';
      else rWinner = 'guest';
      const newScores = { ...game.scores };
      if (rWinner !== 'Draw') newScores[rWinner]++;
      const threshold = Math.floor(game.maxRounds / 2) + 1;
      let matchWinner = null;
      if (newScores.host >= threshold) matchWinner = 'Host';
      else if (newScores.guest >= threshold) matchWinner = 'Guest';
      await updateDoc(doc(db, 'games', roomId), { moves: newMoves, scores: newScores, roundWinner: rWinner, winner: matchWinner });
    } else await updateDoc(doc(db, 'games', roomId), { moves: newMoves });
  };

  const nextRPSRound = async () => {
    playSound('click');
    let nextRoundNum = game.currentRound;
    if (game.roundWinner !== 'Draw') nextRoundNum++;
    await updateDoc(doc(db, 'games', roomId), { moves: { host: null, guest: null }, roundWinner: null, currentRound: nextRoundNum });
  };

  const playDots = async (type, index) => {
    const role = user.uid === game.host ? 'host' : 'guest';
    if (game.winner || game.turn !== role) return;
    if ((type === 'h' && game.hLines[index]) || (type === 'v' && game.vLines[index])) return;
    playSound('move');
    const newHLines = [...game.hLines]; const newVLines = [...game.vLines]; const newBoxes = [...game.boxes]; const newScores = { ...game.scores };
    const R = game.gridSize.r; const C = game.gridSize.c;
    if (type === 'h') newHLines[index] = true; else newVLines[index] = true;
    let boxMade = false;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const boxIndex = r * C + c;
        if (newBoxes[boxIndex]) continue;
        const top = newHLines[r * C + c]; const bottom = newHLines[(r + 1) * C + c];
        const left = newVLines[r * (C + 1) + c]; const right = newVLines[r * (C + 1) + (c + 1)];
        if (top && bottom && left && right) { newBoxes[boxIndex] = role; newScores[role]++; boxMade = true; }
      }
    }
    let winner = null;
    if (newScores.host + newScores.guest === (R * C)) winner = newScores.host > newScores.guest ? 'Host' : (newScores.guest > newScores.host ? 'Guest' : 'Draw');
    await updateDoc(doc(db, 'games', roomId), { hLines: newHLines, vLines: newVLines, boxes: newBoxes, scores: newScores, turn: boxMade ? role : (role === 'host' ? 'guest' : 'host'), winner });
  };

  // --- UI Helpers ---
  const getTheme = (role) => {
    if (!game) return THEMES.blue;
    const color = role === 'host' ? (game.hostColor || 'blue') : (game.guestColor || 'red');
    return THEMES[color] || THEMES.blue;
  };
  const getRematchState = () => game?.rematch || { host: false, guest: false };

  if (!user) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-indigo-600 w-12 h-12"/></div>;

  if (view === 'game' && !game) return <div className="h-screen flex flex-col items-center justify-center bg-white gap-4 animate-pulse"><Loader2 className="animate-spin text-indigo-600 w-10 h-10"/><p className="text-slate-500 font-bold text-lg">Entering Arena...</p></div>;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans w-full overflow-x-hidden selection:bg-indigo-100">
      <style>{`:root,html,body{background-color:#ffffff;color:#0f172a;margin:0;padding:0;width:100%;overflow-x:hidden;}#root{width:100%;min-height:100vh;display:flex;flex-direction:column;}@keyframes dropIn{from{transform:translateY(var(--drop-start));opacity:0;}to{transform:translateY(0);opacity:1;}}.animate-drop{animation:dropIn 0.6s cubic-bezier(0.25,0.8,0.25,1);}.animate-pop{animation:popIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275);}@keyframes popIn{from{transform:scale(0.5);opacity:0;}to{transform:scale(1);opacity:1;}}`}</style>
      
      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-md p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 z-50 w-full transition-all duration-300">
        <div className="flex items-center gap-2 font-black text-indigo-600 text-lg sm:text-xl tracking-tight hover:scale-105 transition-transform cursor-pointer"><Gamepad2 className="animate-spin-slow"/> SpherePlay</div>
        <div className="flex items-center gap-2 text-xs bg-slate-50 p-2 px-3 rounded-full text-slate-600 font-mono border border-slate-100 shadow-sm">
          <div className={`w-2 h-2 rounded-full ${THEMES[playerColor].bg} animate-pulse`}></div>
          {playerName}
        </div>
      </nav>

      <main className="w-full max-w-4xl mx-auto p-4 pb-20 flex-1 transition-all duration-500 ease-in-out">
        
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex justify-between items-center border border-red-100 shadow-sm animate-in slide-in-from-top-2 shadow-red-100"><span>{error}</span><button onClick={() => setError('')}><X size={18}/></button></div>}

        {view === 'lobby' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* --- PROFILE --- */}
            <div className="bg-white p-0 sm:p-6 rounded-2xl space-y-4 max-w-lg mx-auto group">
              <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><User size={14}/> Profile Settings</div>
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full font-bold text-2xl border-b-2 border-slate-100 focus:border-indigo-500 outline-none pb-2 bg-transparent placeholder:text-slate-300 transition-all focus:pl-2 focus:scale-[1.01]" placeholder="Your Name"/>
              <div className="flex gap-4">
                {Object.keys(THEMES).map(color => (
                  <button key={color} onClick={() => { playSound('click'); setPlayerColor(color); }} className={`w-10 h-10 rounded-full ${THEMES[color].bg} transition-all duration-300 ${playerColor === color ? 'ring-4 ring-offset-2 ring-slate-100 scale-110 shadow-lg' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}/>
                ))}
              </div>
            </div>

            {/* --- GAME GRID --- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                {id: 'tictactoe', name: 'Tic Tac Toe', desc: 'Classic 3x3', icon: <div className="flex"><X size={16}/><Circle size={16}/></div>},
                {id: 'connect4', name: 'Connect 4', desc: 'Strategy', icon: <LayoutGrid size={20}/>},
                {id: 'rps', name: 'Rock Paper', desc: 'Instant Action', icon: <div className="flex"><Square size={16}/><Hand size={16}/></div>},
                {id: 'dots', name: 'Dots & Boxes', desc: 'Territory', icon: <Grid3X3 size={20}/>}
              ].map(g => (
                <button key={g.id} onClick={() => { playSound('click'); setSelectedGame(g.id); }} className={`relative p-4 sm:p-6 text-left rounded-2xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 active:scale-95 ${selectedGame === g.id ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100' : 'border-slate-100 bg-white hover:border-indigo-200'}`}>
                  {selectedGame === g.id && <div className="absolute top-2 right-2 text-indigo-600"><Sparkles size={16} className="animate-pulse"/></div>}
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 transition-colors duration-300 ${selectedGame === g.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>{g.icon}</div>
                  <div className="font-bold text-sm sm:text-base text-slate-800 leading-tight">{g.name}</div>
                  <div className="text-[10px] sm:text-xs text-slate-400 font-medium mt-1">{g.desc}</div>
                  {g.id === 'rps' && selectedGame === 'rps' && (
                    <div className="mt-3 pt-3 border-t border-indigo-200/50 animate-in slide-in-from-top-2 duration-300">
                       <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1 sm:mb-2">Rounds</div>
                       <div className="flex gap-1">
                         {[1, 3, 5].map(r => (<button key={r} onClick={(e) => { e.stopPropagation(); playSound('click'); setRpsRounds(r); }} className={`flex-1 py-1 text-[10px] sm:text-xs font-bold rounded transition-all duration-200 ${rpsRounds === r ? 'bg-indigo-600 text-white shadow-md scale-105' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`}>{r}</button>))}
                       </div>
                    </div>
                  )}
                  {g.id === 'dots' && selectedGame === 'dots' && (
                    <div className="mt-3 pt-3 border-t border-indigo-200/50 animate-in slide-in-from-top-2 duration-300">
                       <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1 sm:mb-2">Grid Size</div>
                       <div className="flex gap-1 flex-wrap">
                         {[{l: '3x3', v: {r:3,c:3}}, {l: '4x5', v: {r:4,c:5}}, {l: '5x5', v: {r:5,c:5}}].map(opt => (
                           <button key={opt.l} onClick={(e) => { e.stopPropagation(); playSound('click'); setDotsGrid(opt.v); }} className={`flex-1 py-1 text-[10px] sm:text-xs font-bold rounded whitespace-nowrap px-1 transition-all duration-200 ${dotsGrid.r === opt.v.r && dotsGrid.c === opt.v.c ? 'bg-indigo-600 text-white shadow-md scale-105' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`}>{opt.l}</button>
                         ))}
                       </div>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="max-w-lg mx-auto space-y-6 pt-2 sm:pt-6">
              <button onClick={createGame} disabled={loading} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-xl shadow-indigo-200 hover:shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 group">
                {loading ? <Loader2 className="animate-spin"/> : <><Gamepad2 className="group-hover:rotate-12 transition-transform"/> Create Game Room</>}
              </button>
              <div className="flex gap-3">
                <input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="ENTER ROOM ID" className="flex-1 p-4 border-2 border-slate-200 rounded-xl font-mono uppercase text-center font-bold text-lg focus:border-emerald-500 outline-none transition-all duration-300 bg-slate-50 focus:bg-white focus:shadow-lg focus:scale-[1.02]"/>
                <button onClick={joinGame} className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all duration-300 active:scale-95 hover:shadow-xl hover:-translate-y-1">Join</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto space-y-6 animate-in zoom-in-95 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white border border-slate-100 p-4 rounded-xl shadow-sm gap-3 hover:shadow-md transition-shadow">
              <div className="text-center sm:text-left">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Room Code</span>
                <span className="font-mono text-2xl font-black text-indigo-600 tracking-widest select-all">{roomId}</span>
              </div>
              <button onClick={handleCopy} className={`p-2 rounded-lg transition-all active:scale-95 ${copied ? 'bg-green-100 text-green-600' : 'hover:bg-slate-50 text-slate-400 hover:text-indigo-600'}`}>
                {copied ? <Check size={20} className="animate-in zoom-in"/> : <Copy size={20}/>}
              </button>
            </div>

            <div className="flex justify-between items-center bg-white border border-slate-100 p-3 rounded-2xl shadow-sm">
               <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-500 ${game.turn === 'host' ? 'bg-slate-50 ring-2 ring-indigo-100 scale-105 shadow-md' : 'opacity-40 grayscale scale-95'}`}>
                 <User size={20} className={getTheme('host').text}/>
                 <div><div className={`text-[10px] font-black ${getTheme('host').text} tracking-wider`}>HOST</div><div className="text-sm font-bold leading-none">{game.hostName || 'Player 1'}</div></div>
               </div>
               <div className="text-xs font-black text-slate-300 italic animate-pulse">VS</div>
               <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-500 ${game.turn === 'guest' ? 'bg-slate-50 ring-2 ring-indigo-100 scale-105 shadow-md' : 'opacity-40 grayscale scale-95'}`}>
                 <div className="text-right"><div className={`text-[10px] font-black ${getTheme('guest').text} tracking-wider`}>GUEST</div><div className="text-sm font-bold leading-none">{game.guestName || 'Waiting...'}</div></div>
                 <User size={20} className={getTheme('guest').text}/>
               </div>
            </div>

            {game?.type === 'connect4' && (
              <div className="bg-blue-600 p-2 sm:p-4 rounded-2xl shadow-xl border-b-[6px] border-blue-800 overflow-hidden relative transition-all hover:shadow-2xl">
                 {game.winner && (
                   <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl animate-in fade-in duration-500">
                     <div className="bg-white p-8 rounded-2xl text-center animate-in zoom-in duration-300 shadow-2xl mx-4">
                       <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2 animate-bounce">{game.winner === 'Draw' ? "IT'S A DRAW!" : `${game.winner === 'Host' ? game.hostName : game.guestName} WINS!`}</h2>
                       <div className="mt-6 space-y-3">
                         {getRematchState()[user.uid === game.host ? 'host' : 'guest'] ? <div className="text-indigo-600 font-bold animate-pulse">Waiting for opponent...</div> : <button onClick={handleRematch} className="w-full px-8 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 shadow-lg"><RefreshCw size={18}/> Play Again</button>}
                         <button onClick={abandonGame} className="w-full px-8 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"><LogOut size={18}/> Abandon Room</button>
                       </div>
                     </div>
                   </div>
                 )}
                 <div className="grid grid-cols-7 gap-1 sm:gap-2">
                   {game.board.map((cell, i) => {
                     const col = i % 7; const row = Math.floor(i / 7); const dropDistance = `-${(row + 1) * 120}%`;
                     return (
                       <button key={i} onClick={() => playConnect4(col)} disabled={!!game.winner} className="aspect-square bg-blue-700 rounded-full relative shadow-inner hover:brightness-110 active:scale-95 transition-all z-10 duration-200">
                         <div style={{ '--drop-start': dropDistance }} className={`absolute inset-[2px] sm:inset-1 rounded-full shadow-inner transition-all duration-300 ${cell === 'host' ? `${getTheme('host').bg} animate-drop` : cell === 'guest' ? `${getTheme('guest').bg} animate-drop` : 'bg-slate-900/40'}`}></div>
                       </button>
                     );
                   })}
                 </div>
              </div>
            )}

            {game?.type === 'dots' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto relative">
                {game.winner && (
                   <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl animate-in fade-in">
                     <div className="text-center">
                        <h2 className="text-3xl font-black text-indigo-600 mb-6">{game.winner === 'Host' ? game.hostName : game.guestName} WINS!</h2>
                        <div className="flex gap-3">
                          {getRematchState()[user.uid === game.host ? 'host' : 'guest'] ? <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold animate-pulse">Waiting...</div> : <button onClick={handleRematch} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-all flex gap-2"><RefreshCw/> Rematch</button>}
                          <button onClick={abandonGame} className="px-6 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300">Exit</button>
                        </div>
                     </div>
                   </div>
                )}
                <div className="flex justify-between mb-8">
                  <div className={`text-center transition-all duration-500 ${game.turn === 'host' ? 'scale-125' : 'scale-100 opacity-50'}`}><div className={`text-3xl font-black ${getTheme('host').text}`}>{game.scores.host}</div></div>
                  <div className="text-xs font-black bg-slate-100 px-3 py-1 rounded-full h-fit self-center tracking-widest text-slate-400">SCORE</div>
                  <div className={`text-center transition-all duration-500 ${game.turn === 'guest' ? 'scale-125' : 'scale-100 opacity-50'}`}><div className={`text-3xl font-black ${getTheme('guest').text}`}>{game.scores.guest}</div></div>
                </div>
                <div className="flex flex-col items-center select-none" style={{touchAction: 'none'}}>
                  {Array(game.gridSize.r + 1).fill(0).map((_, r) => (
                    <div key={r} className="flex flex-col">
                      <div className="flex items-center">
                        {Array(game.gridSize.c + 1).fill(0).map((_, c) => (
                          <React.Fragment key={c}>
                            <div className="w-3 h-3 bg-slate-800 rounded-full z-10 transition-transform hover:scale-150 duration-200" />
                            {c < game.gridSize.c && <div onClick={() => playDots('h', r * game.gridSize.c + c)} className={`w-12 sm:w-16 h-4 -my-0.5 cursor-pointer transition-all duration-300 relative z-0 hover:h-6 ${game.hLines[r * game.gridSize.c + c] ? 'bg-slate-800' : 'bg-slate-100 hover:bg-indigo-200'}`} />}
                          </React.Fragment>
                        ))}
                      </div>
                      {r < game.gridSize.r && (
                        <div className="flex items-center h-12 sm:h-16">
                          {Array(game.gridSize.c + 1).fill(0).map((_, c) => (
                            <React.Fragment key={c}>
                              <div onClick={() => playDots('v', r * (game.gridSize.c + 1) + c)} className={`w-4 -mx-0.5 h-full cursor-pointer transition-all duration-300 relative z-0 hover:w-6 ${game.vLines[r * (game.gridSize.c + 1) + c] ? 'bg-slate-800' : 'bg-slate-100 hover:bg-indigo-200'}`} />
                              {c < game.gridSize.c && <div className={`w-12 sm:w-16 h-full flex items-center justify-center transition-all duration-500 ${game.boxes[r * game.gridSize.c + c] ? (game.boxes[r * game.gridSize.c + c] === 'host' ? getTheme('host').light : getTheme('guest').light) : ''}`}>{game.boxes[r * game.gridSize.c + c] && <span className={`font-black text-xl sm:text-2xl animate-pop ${game.boxes[r * game.gridSize.c + c] === 'host' ? getTheme('host').text : getTheme('guest').text}`}>{game.boxes[r * game.gridSize.c + c] === 'host' ? game.hostName[0] : (game.guestName?.[0] || 'G')}</span>}</div>}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {game?.type === 'tictactoe' && (
              <>
               <div className="text-center font-bold text-slate-400 text-sm tracking-widest uppercase mb-4">{game.winner ? (game.winner === 'Draw' ? "Draw!" : `${game.winner === 'X' ? game.hostName : game.guestName} Wins!`) : `Turn: ${game.turn === 'host' ? 'X' : 'O'}`}</div>
               <div className="grid grid-cols-3 gap-3 bg-slate-100 p-3 rounded-2xl relative">
                 {game.winner && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl animate-in fade-in">
                        <div className="text-center space-y-4">
                           <h2 className="text-4xl font-black text-slate-800 animate-bounce">{game.winner === 'Draw' ? 'DRAW' : 'WINNER!'}</h2>
                           <div className="flex gap-2 justify-center">
                              {getRematchState()[user.uid === game.host ? 'host' : 'guest'] ? <div className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold">Waiting...</div> : <button onClick={handleRematch} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold shadow-md hover:scale-105 transition-transform">Play Again</button>}
                              <button onClick={abandonGame} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-300">Exit</button>
                           </div>
                        </div>
                    </div>
                 )}
                 {game.board.map((cell, i) => (
                   <button key={i} onClick={() => { if (!cell && !game.winner) playTicTacToe(i); }} className={`aspect-square bg-white rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 ${!cell && !game.winner ? 'hover:bg-indigo-50 cursor-pointer active:scale-95 hover:shadow-inner' : 'cursor-default'}`}>
                     {cell === 'X' && <X className={`w-3/5 h-3/5 ${getTheme('host').text} animate-pop`} strokeWidth={2.5} style={{opacity: 1, color: 'currentColor'}} />}
                     {cell === 'O' && <Circle className={`w-3/5 h-3/5 ${getTheme('guest').text} animate-pop`} strokeWidth={2.5} style={{opacity: 1, color: 'currentColor'}} />}
                   </button>
                 ))}
               </div>
              </>
            )}

            {game?.type === 'rps' && (
               <div className="space-y-6">
                 {game.winner && (
                    <div className="p-6 bg-white border-2 border-indigo-100 rounded-2xl text-center animate-in zoom-in">
                       <Trophy className="w-16 h-16 mx-auto text-yellow-400 mb-2"/>
                       <h2 className="text-2xl font-black text-slate-800 mb-4">{game.winner === 'Host' ? game.hostName : game.guestName} WINS THE MATCH!</h2>
                       <div className="flex gap-2 justify-center">
                          {getRematchState()[user.uid === game.host ? 'host' : 'guest'] ? <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold">Waiting for opponent...</div> : <button onClick={handleRematch} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform">Start Rematch</button>}
                          <button onClick={abandonGame} className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200">Leave</button>
                       </div>
                    </div>
                 )}
                 {!game.winner && (
                 <>
                 <div className="flex justify-between items-center bg-slate-800 text-white p-6 rounded-2xl shadow-xl">
                    <div className={`text-center ${getTheme('host').text} brightness-150 transition-all duration-500 ${game.scores.host > game.scores.guest ? 'scale-110' : ''}`}><div className="text-[10px] font-bold opacity-60 tracking-widest mb-1">HOST</div><div className="text-4xl font-black animate-pop" key={game.scores.host}>{game.scores.host}</div></div>
                    <div className="text-center"><div className="text-[10px] font-black text-white bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">ROUND {game.currentRound} / {game.maxRounds}</div></div>
                    <div className={`text-center ${getTheme('guest').text} brightness-150 transition-all duration-500 ${game.scores.guest > game.scores.host ? 'scale-110' : ''}`}><div className="text-[10px] font-bold opacity-60 tracking-widest mb-1">GUEST</div><div className="text-4xl font-black animate-pop" key={game.scores.guest}>{game.scores.guest}</div></div>
                 </div>
                 <div className="text-center py-4">
                   {game.roundWinner ? (
                      <div className="space-y-8 animate-in fade-in">
                         <div className="text-2xl font-black text-slate-700">{game.roundWinner === 'Draw' ? "DRAW!" : `${game.roundWinner === 'host' ? game.hostName : game.guestName} WINS ROUND!`}</div>
                         <div className="flex justify-center gap-12 opacity-90"><div className={`text-center ${getTheme('host').text} scale-125 transition-transform duration-500 animate-pop`}>{getIcon(game.moves.host)}</div><div className={`text-center ${getTheme('guest').text} scale-125 transition-transform duration-500 animate-pop`}>{getIcon(game.moves.guest)}</div></div>
                         <button onClick={nextRPSRound} className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all duration-200 hover:scale-[1.02] active:scale-95">Next Round</button>
                      </div>
                   ) : (
                     <div className="space-y-8">
                       <div className="flex justify-center gap-4 sm:gap-8">
                         <div className={`p-4 w-32 rounded-xl border-2 transition-all duration-300 ${game.moves.host ? `${getTheme('host').light} ${getTheme('host').border} scale-105 shadow-md` : 'border-slate-200 bg-slate-50'}`}><span className="text-[10px] font-bold tracking-widest block mb-2">HOST</span><div className="text-xs font-bold">{game.moves.host ? 'READY' : 'Thinking...'}</div></div>
                         <div className={`p-4 w-32 rounded-xl border-2 transition-all duration-300 ${game.moves.guest ? `${getTheme('guest').light} ${getTheme('guest').border} scale-105 shadow-md` : 'border-slate-200 bg-slate-50'}`}><span className="text-[10px] font-bold tracking-widest block mb-2">GUEST</span><div className="text-xs font-bold">{game.moves.guest ? 'READY' : 'Thinking...'}</div></div>
                       </div>
                       <div className="flex justify-center gap-3">
                         {['rock', 'paper', 'scissors'].map((m) => (<button key={m} onClick={() => playRPS(m)} disabled={game.moves[user.uid === game.host ? 'host' : 'guest']} className={`p-6 bg-white rounded-2xl shadow-lg border-b-4 hover:-translate-y-2 transition-all disabled:opacity-50 border-slate-200 hover:border-indigo-300 active:translate-y-0 active:border-t-4 duration-200 hover:shadow-xl`}>{getIcon(m)}</button>))}
                       </div>
                     </div>
                   )}
                 </div>
                 </>
                 )}
               </div>
            )}

            <button onClick={abandonGame} className="w-full text-slate-300 text-xs font-black hover:text-red-500 mt-6 tracking-[0.2em] uppercase transition-colors duration-300">Abandon Game</button>
          </div>
        )}
      </main>
    </div>
  );
}

function getIcon(move) {
  if (move === 'rock') return <Square size={32} fill="currentColor"/>;
  if (move === 'paper') return <Hand size={32} fill="currentColor"/>;
  if (move === 'scissors') return <Scissors size={32}/>;
  return <div className="w-8 h-8"/>;
}