import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import ChessBoardComponent from "./components/ChessBoard.jsx";
import AuthPage from "./components/AuthPage.jsx";
import GameOverModal from "./components/GameOverModal.jsx";
import axios from "axios";
import "./index.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const API = `${BACKEND_URL}/api/auth`;

function App() {
  const [token, setToken] = useState(localStorage.getItem("chess-token"));
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem("chess-user");
    return stored ? JSON.parse(stored) : null;
  });

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [gameId, setGameId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [role, setRole] = useState(null);
  const [fen, setFen] = useState("start");
  const [turn, setTurn] = useState("white");
  const [winner, setWinner] = useState(null);
  const [boardKey, setBoardKey] = useState(0);

  const [whitePlayer, setWhitePlayer] = useState(null);
  const [blackPlayer, setBlackPlayer] = useState(null);
  const [ratingUpdate, setRatingUpdate] = useState(null);

  const [messages, setMessages] = useState([]);
  const [reaction, setReaction] = useState(null);
  const [chatInput, setChatInput] = useState("");

  const [uploading, setUploading] = useState(false);

  const [ghostCharges, setGhostCharges] = useState(3);
  const [isGhostLoading, setIsGhostLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    const s = io(BACKEND_URL, {
      autoConnect: true,
      auth: { token },
    });

    s.on("connect", () => setIsConnected(true));
    s.on("disconnect", () => setIsConnected(false));

    s.on("auth-success", ({ user }) => {
      setCurrentUser(user);
      localStorage.setItem("chess-user", JSON.stringify(user));
    });

    s.on("game-created", ({ gameId }) => {
      setGameId(gameId);
      setPlayerColor("white");
      setRole("player");
      setGhostCharges(3);
      setAiSummary(null);
      setSummaryLoading(false);
    });

    s.on("game-joined", ({ gameId, color, role, fen, white, black, messages }) => {
      setGameId(gameId);
      setRole(role);
      if (color) setPlayerColor(color);
      if (fen) setFen(fen);
      if (white) setWhitePlayer(white);
      if (black) setBlackPlayer(black);
      if (messages) setMessages(messages);
      setGhostCharges(3);
      setAiSummary(null);
      setSummaryLoading(false);
    });

    s.on("game-started", ({ fen, turn, white, black, messages }) => {
      setFen(fen);
      setTurn(turn || "white");
      setWinner(null);
      setRatingUpdate(null);
      setWhitePlayer(white);
      setBlackPlayer(black);
      if (messages) setMessages(messages);
      setAiSummary(null);
      setSummaryLoading(false);
    });

    s.on("move-made", ({ fen, turn }) => {
      setFen(fen);
      setTurn(turn);
      setIsGhostLoading(false);
    });

    s.on("game-over", ({ winner, reason, ratingUpdate }) => {
      setWinner({ player: winner, reason });
      if (ratingUpdate) setRatingUpdate(ratingUpdate);
      setSummaryLoading(true);
      setIsGhostLoading(false);

      if (ratingUpdate && currentUser) {
        const myUpdate =
          playerColor === "white" ? ratingUpdate.white : ratingUpdate.black;
        if (myUpdate) {
          const updated = { ...currentUser, rating: myUpdate.newRating };
          setCurrentUser(updated);
          localStorage.setItem("chess-user", JSON.stringify(updated));
        }
      }
    });

    s.on("ai-summary", ({ summary }) => {
      setAiSummary(summary);
      setSummaryLoading(false);
    });

    s.on("ghost-charge-update", ({ charges }) => {
      setGhostCharges(charges);
    });

    s.on("receive-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    s.on("receive-reaction", ({ user, emoji }) => {
      setReaction({ user, emoji });
      setTimeout(() => setReaction(null), 2500);
    });

    s.on("player-disconnected", ({ message }) => {
      alert(message);
    });

    s.on("error", ({ message }) => {
      alert(message);
      setBoardKey((k) => k + 1);
      setIsGhostLoading(false);
    });

    s.on("connect_error", (err) => {
      if (err.message === "Authentication required" || err.message === "Invalid token") {
        handleLogout();
      }
    });

    setSocket(s);

    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  const handleLogin = (newToken, user) => {
    setToken(newToken);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("chess-token");
    localStorage.removeItem("chess-user");
    setToken(null);
    setCurrentUser(null);
    setGameId(null);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);

      const { data } = await axios.put(API + "/profile/photo", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setCurrentUser(data.user);
      localStorage.setItem("chess-user", JSON.stringify(data.user));
    } catch (err) {
      alert(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const createGame = () => socket?.emit("create-game");

  const joinGame = (e) => {
    e.preventDefault();
    const id = e.target.elements.gameId.value;
    if (id) socket?.emit("join-game", { gameId: id });
  };

  const leaveGame = () => {
    socket?.emit("leave-game");
    setGameId(null);
    setPlayerColor(null);
    setRole(null);
    setFen("start");
    setTurn("white");
    setWinner(null);
    setRatingUpdate(null);
    setWhitePlayer(null);
    setBlackPlayer(null);
    setMessages([]);
    setReaction(null);
    setChatInput("");
    setGhostCharges(3);
    setAiSummary(null);
    setSummaryLoading(false);
    setIsGhostLoading(false);
  };

  const handleGhostMove = () => {
    if (!socket || isGhostLoading) return;
    setIsGhostLoading(true);
    socket.emit("ghost-move");
  };

  if (!token || !currentUser) {
    return <AuthPage onLogin={handleLogin} />;
  }

  const isSpectator = role === "spectator";
  const bothPlayersPresent = whitePlayer && blackPlayer;
  const isMyTurn = !isSpectator && turn === playerColor;

  const statusLabel = !bothPlayersPresent
    ? "Waiting for opponent..."
    : isSpectator
    ? `${turn.charAt(0).toUpperCase() + turn.slice(1)}'s Turn`
    : isMyTurn
    ? "Your Turn"
    : "Opponent's Turn";

  const opponent =
    playerColor === "white" ? blackPlayer : whitePlayer;

  if (!gameId) {
    return (
      <div className="w-full max-w-md p-8 space-y-6 bg-dark-800 rounded-2xl shadow-2xl border border-dark-700 mx-auto mt-20">
        <div className="flex items-center gap-4 pb-4 border-b border-dark-700">
          <label className="relative cursor-pointer group">
            <div className="w-14 h-14 rounded-full bg-dark-700 overflow-hidden border-2 border-dark-600 group-hover:border-blue-500 transition">
              {currentUser.profilePhoto ? (
                <img
                  src={currentUser.profilePhoto}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              disabled={uploading}
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white border-2 border-dark-800">
              ✎
            </div>
          </label>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">{currentUser.username}</p>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="text-yellow-400 font-bold">{currentUser.rating} ELO</span>
              <span>{currentUser.wins}W / {currentUser.losses}L / {currentUser.draws}D</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-red-400 text-xs transition px-2 py-1 border border-dark-700 rounded-lg hover:border-red-500/30"
          >
            Logout
          </button>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-1">
            CheckMate Arena
          </h1>
          <div className="inline-flex items-center space-x-2 text-sm bg-dark-900 px-3 py-1 rounded-full border border-dark-700">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-gray-300">
              {isConnected ? "Server Connected" : "Connecting..."}
            </span>
          </div>
        </div>

        <div className="space-y-4">
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

  const PlayerCard = ({ player, label, isActive }) => {
    if (!player) return null;
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-xl border transition ${
          isActive
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-dark-900 border-dark-700"
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-dark-700 overflow-hidden border-2 border-dark-600 flex-shrink-0">
          {player.profilePhoto ? (
            <img src={player.profilePhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">
              {player.username?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{player.username}</p>
          <p className="text-yellow-400 text-xs font-semibold">{player.rating} ELO</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen p-4 md:p-8 flex flex-col md:flex-row gap-8 items-center md:items-start justify-center">
      <div className="flex-1 bg-dark-800 p-4 md:p-8 rounded-2xl shadow-2xl border border-dark-700 w-full flex items-center justify-center relative">
        <GameOverModal
          winner={winner}
          ratingUpdate={ratingUpdate}
          whitePlayer={whitePlayer}
          blackPlayer={blackPlayer}
          aiSummary={aiSummary}
          summaryLoading={summaryLoading}
          onLeave={leaveGame}
        />

        {reaction && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-bounce flex flex-col items-center">
            <span className="text-6xl filter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">{reaction.emoji}</span>
            <span className="text-sm font-bold text-white bg-dark-900/90 px-3 py-1 rounded-full mt-2 shadow-xl border border-dark-700">
              {reaction.user.username}
            </span>
          </div>
        )}

        <ChessBoardComponent
          key={boardKey}
          fen={fen}
          playerColor={playerColor}
          isConnected={isConnected}
          socket={socket}
          role={role}
          bothPlayersPresent={bothPlayersPresent}
          ghostCharges={ghostCharges}
          onGhostMove={handleGhostMove}
          isMyTurn={isMyTurn}
          isGhostLoading={isGhostLoading}
        />
      </div>

      <div className="w-full md:w-80 bg-dark-800 p-6 rounded-2xl shadow-xl border border-dark-700 space-y-4">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Game ID</h2>
          <div className="font-mono text-xl text-blue-400 bg-dark-900 px-4 py-2 rounded-xl border border-dark-700 select-all tracking-wider text-center">
            {gameId}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Players</h2>
          <PlayerCard
            player={whitePlayer}
            label="White"
            isActive={turn === "white"}
          />
          <PlayerCard
            player={blackPlayer}
            label="Black"
            isActive={turn === "black"}
          />
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Status</h2>
          <div className="flex items-center space-x-3 bg-dark-900 p-3 rounded-xl border border-dark-700">
            <div
              className={`w-3 h-3 rounded-full animate-pulse ${
                isMyTurn
                  ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                  : "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
              }`}
            ></div>
            <span className="text-lg font-medium text-white">{statusLabel}</span>
          </div>
        </div>

        {role === "player" && (
          <div>
            <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Ghost Mode</h2>
            <div
              style={{
                background: "rgba(124,58,237,0.06)",
                border: "1px solid rgba(124,58,237,0.2)",
              }}
              className="p-3 rounded-xl flex items-center gap-3"
            >
              <span className="text-xl">👻</span>
              <div className="flex-1">
                <p className="text-purple-300 text-sm font-semibold">AI Co-Pilot</p>
                <p className="text-gray-500 text-xs">{ghostCharges} charge{ghostCharges !== 1 ? "s" : ""} remaining</p>
              </div>
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: i < ghostCharges
                        ? "linear-gradient(135deg, #a78bfa, #818cf8)"
                        : "rgba(167,139,250,0.2)",
                      boxShadow: i < ghostCharges ? "0 0 5px rgba(167,139,250,0.5)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col h-64 bg-dark-900 rounded-xl border border-dark-700 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm flex flex-col-reverse">
            <div className="space-y-2 flex flex-col justify-end">
              {messages.map((msg) => (
                <div key={msg.id} className="break-words">
                  <span className={`font-bold ${msg.isSpectator ? "text-gray-500" : "text-blue-400"}`}>
                    {msg.user.username}:
                  </span>{" "}
                  <span className="text-gray-300">{msg.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-dark-700 p-2 space-y-2">
            <div className="flex gap-2 justify-center">
              {["👍", "😂", "😭", "🤯", "🔥"].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => socket?.emit("send-reaction", { emoji })}
                  className="hover:bg-dark-700 p-1 rounded transition text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                socket?.emit("send-message", { text: chatInput });
                setChatInput("");
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Chat here..."
                maxLength={100}
                className="flex-1 min-w-0 bg-dark-800 text-sm px-3 py-2 rounded-lg border border-dark-700 focus:outline-none focus:border-blue-500 text-white"
              />
            </form>
          </div>
        </div>

        <div className="pt-4 border-t border-dark-700">
          <button
            onClick={leaveGame}
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