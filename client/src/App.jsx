import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import ChessBoardComponent from './components/ChessBoard.jsx';
import './index.css';

const socket = io('http://localhost:8000', { autoConnect: false });

function App() {
  const [gameId, setGameId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [role, setRole] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [fen, setFen] = useState('start');
  const [turn, setTurn] = useState('white');
  const [winner, setWinner] = useState(null);
  const [boardKey, setBoardKey] = useState(0);

  console.log("🏠 [App] RENDER - state:", { gameId, playerColor, role, isConnected, fen, turn, boardKey });

  useEffect(() => {
    console.log("🔌 [App] useEffect: calling socket.connect()");
    socket.connect();

    const onConnect = () => {
      console.log("🟢 [App] socket connected! id:", socket.id);
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log("🔴 [App] socket disconnected!");
      setIsConnected(false);
    };

    const onGameCreated = ({ gameId }) => {
      console.log("🎮 [App] game-created received:", { gameId });
      setGameId(gameId);
      setPlayerColor('white');
      setRole('player');
    };

    const onGameJoined = ({ gameId, color, role, fen }) => {
      console.log("🎮 [App] game-joined received:", { gameId, color, role, fen });
      setGameId(gameId);
      setRole(role);
      if (color) setPlayerColor(color);
      if (fen) setFen(fen);
    };

    const onGameStarted = ({ fen, turn }) => {
      console.log("🚀 [App] game-started received:", { fen, turn });
      setFen(fen);
      setTurn(turn || 'white');
      setWinner(null);
    };

    const onMoveMade = ({ fen, turn }) => {
      console.log("♟️ [App] move-made received:", { fen, turn });
      setFen(fen);
      setTurn(turn);
    };

    const onGameOver = ({ winner, reason }) => {
      console.log("🏆 [App] game-over received:", { winner, reason });
      setWinner({ player: winner, reason });
    };

    const onPlayerDisconnected = ({ message }) => {
      console.log("👋 [App] player-disconnected received:", message);
      alert(message);
      window.location.reload();
    };

    const onError = ({ message }) => {
      console.error("❗ [App] error received from server:", message);
      alert(message);
      setBoardKey((k) => k + 1);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game-created', onGameCreated);
    socket.on('game-joined', onGameJoined);
    socket.on('game-started', onGameStarted);
    socket.on('move-made', onMoveMade);
    socket.on('game-over', onGameOver);
    socket.on('player-disconnected', onPlayerDisconnected);
    socket.on('error', onError);

    return () => {
      console.log("🔌 [App] useEffect cleanup: removing socket listeners");
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game-created', onGameCreated);
      socket.off('game-joined', onGameJoined);
      socket.off('game-started', onGameStarted);
      socket.off('move-made', onMoveMade);
      socket.off('game-over', onGameOver);
      socket.off('player-disconnected', onPlayerDisconnected);
      socket.off('error', onError);
      socket.disconnect();
    };
  }, []);

  const createGame = () => {
    console.log("🎮 [App] Creating game...");
    socket.emit('create-game');
  };

  const joinGame = (e) => {
    e.preventDefault();
    const id = e.target.elements.gameId.value;
    console.log("🎮 [App] Joining game:", id);
    if (id) {
      socket.emit('join-game', { gameId: id });
    }
  };

  const isSpectator = role === 'spectator';
  const isMyTurn = !isSpectator && turn === playerColor;
  const statusLabel = isSpectator
    ? `${turn.charAt(0).toUpperCase() + turn.slice(1)}'s Turn`
    : isMyTurn
    ? 'Your Turn'
    : "Opponent's Turn";

  // Lobby UI
  if (!gameId) {
    return (
      <div className="w-full max-w-md p-8 space-y-8 bg-dark-800 rounded-2xl shadow-2xl border border-dark-700 backdrop-blur-sm mx-auto mt-20">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
            Socket Chess
          </h1>
          <p className="text-gray-400">Play real-time chess with friends</p>
          <div className="mt-4 inline-flex items-center space-x-2 text-sm bg-dark-900 px-3 py-1 rounded-full border border-dark-700">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-300">{isConnected ? 'Server Connected' : 'Connecting...'}</span>
          </div>
        </div>

        <div className="space-y-6">
          <button
            onClick={createGame}
            disabled={!isConnected}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-200 shadow-lg shadow-emerald-900/50"
          >
            Create New Game
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-dark-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-dark-800 text-gray-400">Or join existing</span>
            </div>
          </div>

          <form onSubmit={joinGame} className="space-y-3">
            <input
              name="gameId"
              type="text"
              placeholder="Enter Game ID"
              required
              className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!isConnected}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-200 shadow-lg shadow-blue-900/50"
            >
              Join Game
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active Game UI
  console.log("🏠 [App] Rendering game board. Passing to ChessBoard:", { fen, playerColor, isConnected, role, boardKey });

  return (
    <div className="w-full min-h-screen p-4 md:p-8 flex flex-col md:flex-row gap-8 items-center md:items-start justify-center">
      <div className="flex-1 bg-dark-800 p-4 md:p-8 rounded-2xl shadow-2xl border border-dark-700 w-full flex align-center justify-center relative">
        {winner && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-dark-900/80 backdrop-blur-sm rounded-2xl">
            <div className="text-center bg-dark-800 p-8 rounded-2xl border border-dark-600 shadow-2xl transform scale-105 transition-all">
              <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600 mb-2">
                Game Over!
              </h2>
              <p className="text-xl text-white mb-1">
                {winner.player === 'none' ? 'Draw' : `${winner.player} wins!`}
              </p>
              <p className="text-gray-400 capitalize mb-6">by {winner.reason}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition shadow-lg shadow-blue-500/30"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        <ChessBoardComponent
          key={boardKey}
          fen={fen}
          playerColor={playerColor}
          isConnected={isConnected}
          socket={socket}
          role={role}
        />
      </div>

      <div className="w-full md:w-80 bg-dark-800 p-6 rounded-2xl shadow-xl border border-dark-700 space-y-6">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Game ID</h2>
          <div className="font-mono text-2xl text-blue-400 bg-dark-900 px-4 py-2 rounded-xl border border-dark-700 select-all tracking-wider text-center flex justify-center">
            {gameId}
          </div>
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Status</h2>
          <div className="flex items-center space-x-3 bg-dark-900 p-3 rounded-xl border border-dark-700">
            <div
              className={`w-3 h-3 rounded-full animate-pulse ${
                isMyTurn
                  ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                  : turn
                  ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]'
                  : 'bg-gray-500'
              }`}
            ></div>
            <span className="text-lg font-medium text-white">{statusLabel}</span>
          </div>
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Your Role</h2>
          <div className="flex items-center space-x-3 bg-dark-900 p-3 rounded-xl border border-dark-700">
            {isSpectator ? (
              <span className="text-xl font-semibold text-white">
                Spectating
              </span>
            ) : (
              <>
                <span
                  className={`w-6 h-6 rounded-full border-4 shadow-sm ${
                    playerColor === 'white' ? 'bg-white border-gray-300' : 'bg-black border-gray-700'
                  }`}
                ></span>
                <span className="text-xl font-semibold capitalize text-white">{playerColor}</span>
              </>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-dark-700">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-dark-700 hover:bg-red-600 border border-dark-600 hover:border-red-500 text-white font-medium rounded-xl transition duration-200"
          >
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;