const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// State Management
const games = new Map();
const userGames = new Map();

io.on("connection", (socket) => {
    console.log("🟢 [SERVER] User connected:", socket.id);

    // 1. Create Game
    socket.on("create-game", () => {
        const gameId = crypto.randomBytes(4).toString("hex");
        const chess = new Chess();

        games.set(gameId, {
            chess,
            players: { white: socket.id, black: null },
            spectators: [],
        });
        userGames.set(socket.id, gameId);

        socket.join(gameId);
        socket.emit("game-created", { gameId });
        console.log(`🎮 [SERVER] Game created: ${gameId} by ${socket.id} (white)`);
    });

    // 2. Join Game
    socket.on("join-game", ({ gameId }) => {
        console.log(`🎮 [SERVER] join-game request: gameId=${gameId} from ${socket.id}`);
        const game = games.get(gameId);
        if (!game) {
            console.log(`❌ [SERVER] Game ${gameId} not found`);
            return socket.emit("error", { message: "Game not found" });
        }

        if (game.players.white === socket.id || game.players.black === socket.id) {
            console.log(`❌ [SERVER] ${socket.id} already in game ${gameId}`);
            return socket.emit("error", { message: "You are already in this game" });
        }

        let assignedColor = null;
        if (!game.players.white) {
            game.players.white = socket.id;
            assignedColor = "white";
        } else if (!game.players.black) {
            game.players.black = socket.id;
            assignedColor = "black";
        } else {
            game.spectators.push(socket.id);
            userGames.set(socket.id, gameId);
            socket.join(gameId);
            console.log(`👀 [SERVER] ${socket.id} joined as spectator in ${gameId}`);
            return socket.emit("game-joined", {
                gameId,
                role: "spectator",
                fen: game.chess.fen(),
            });
        }

        userGames.set(socket.id, gameId);
        socket.join(gameId);
        console.log(`✅ [SERVER] ${socket.id} joined as ${assignedColor} in ${gameId}`);
        socket.emit("game-joined", {
            gameId,
            role: "player",
            color: assignedColor,
            fen: game.chess.fen(),
        });

        if (game.players.white && game.players.black) {
            const currentTurn = game.chess.turn() === "w" ? "white" : "black";
            console.log(`🚀 [SERVER] Both players present! Emitting game-started. Turn: ${currentTurn}`);
            console.log(`🚀 [SERVER] White: ${game.players.white}, Black: ${game.players.black}`);
            io.to(gameId).emit("game-started", {
                fen: game.chess.fen(),
                turn: currentTurn,
            });
        }
    });

    // 3. Handle Moves
    socket.on("move", (data) => {
        console.log(`♟️ [SERVER] move received from ${socket.id}:`, data);

        const gameId = userGames.get(socket.id);
        if (!gameId) {
            console.log(`❌ [SERVER] ${socket.id} is not in any game`);
            return socket.emit("error", { message: "You are not in a game" });
        }

        const game = games.get(gameId);
        if (!game) {
            console.log(`❌ [SERVER] Game ${gameId} not found`);
            return socket.emit("error", { message: "Game not found" });
        }

        const isWhite = game.players.white === socket.id;
        const isBlack = game.players.black === socket.id;
        console.log(`♟️ [SERVER] Player check - isWhite: ${isWhite}, isBlack: ${isBlack}`);

        if (!isWhite && !isBlack) {
            console.log(`❌ [SERVER] ${socket.id} is a spectator, cannot move`);
            return socket.emit("error", { message: "Spectators cannot move" });
        }

        if (game.chess.isGameOver()) {
            console.log(`❌ [SERVER] Game is already over`);
            return socket.emit("error", { message: "The game is already over" });
        }

        if (!data || typeof data !== "object" || !data.from || !data.to) {
            console.log(`❌ [SERVER] Invalid move data:`, data);
            return socket.emit("error", { message: "Invalid move data" });
        }

        const turn = game.chess.turn() === "w" ? "white" : "black";
        console.log(`♟️ [SERVER] Current turn: ${turn}, isWhite: ${isWhite}, isBlack: ${isBlack}`);

        if ((isWhite && turn !== "white") || (isBlack && turn !== "black")) {
            console.log(`❌ [SERVER] Not this player's turn`);
            return socket.emit("error", { message: "It is not your turn" });
        }

        console.log(`♟️ [SERVER] Current board FEN before move: ${game.chess.fen()}`);
        console.log(`♟️ [SERVER] Attempting move:`, data);

        try {
            const move = game.chess.move(data);
            console.log(`✅ [SERVER] Move accepted:`, move);
            console.log(`✅ [SERVER] New FEN: ${game.chess.fen()}`);

            const newTurn = game.chess.turn() === "w" ? "white" : "black";
            console.log(`✅ [SERVER] Emitting move-made to room ${gameId}. New turn: ${newTurn}`);

            io.to(gameId).emit("move-made", {
                move,
                fen: game.chess.fen(),
                turn: newTurn,
            });

            if (game.chess.isGameOver()) {
                let reason = "unknown";
                if (game.chess.isCheckmate()) reason = "checkmate";
                else if (game.chess.isStalemate()) reason = "stalemate";
                else if (game.chess.isDraw()) reason = "draw";

                let winner = "none";
                if (reason === "checkmate") {
                    winner = turn;
                }

                console.log(`🏆 [SERVER] Game over! Winner: ${winner}, Reason: ${reason}`);
                io.to(gameId).emit("game-over", { winner, reason });
            }
        } catch (err) {
            console.error(`❌ [SERVER] Invalid move error:`, err.message);
            console.error(`❌ [SERVER] Board FEN was: ${game.chess.fen()}`);
            console.error(`❌ [SERVER] Move data was:`, data);
            socket.emit("error", { message: "Invalid move" });
        }
    });

    // 4. Disconnect
    socket.on("disconnect", () => {
        console.log("🔴 [SERVER] User disconnected:", socket.id);
        const gameId = userGames.get(socket.id);

        if (gameId) {
            const game = games.get(gameId);
            if (game) {
                const wasPlayer =
                    game.players.white === socket.id || game.players.black === socket.id;

                if (game.players.white === socket.id) {
                    game.players.white = null;
                    console.log(`🔴 [SERVER] White player left game ${gameId}`);
                } else if (game.players.black === socket.id) {
                    game.players.black = null;
                    console.log(`🔴 [SERVER] Black player left game ${gameId}`);
                } else {
                    game.spectators = game.spectators.filter((s) => s !== socket.id);
                    console.log(`🔴 [SERVER] Spectator left game ${gameId}`);
                }

                if (wasPlayer) {
                    io.to(gameId).emit("player-disconnected", {
                        message: "A player has disconnected. The game has ended.",
                    });
                }

                if (
                    !game.players.white &&
                    !game.players.black &&
                    game.spectators.length === 0
                ) {
                    games.delete(gameId);
                    console.log(`🗑️ [SERVER] Game ${gameId} cleaned up.`);
                }
            }
            userGames.delete(socket.id);
        }
    });
});

const PORT = 8000;
server.listen(PORT, () => {
    console.log(`🚀 [SERVER] Running on port ${PORT}`);
});