require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");
const mongoose = require("mongoose");
const { Chess } = require("chess.js");
const crypto = require("crypto");
const { OpenAI } = require("openai");

const authRoutes = require("./routes/auth");
const { socketAuthMiddleware } = require("./middleware/auth");
const { calculateElo } = require("./utils/elo");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

io.use(socketAuthMiddleware);

const games = new Map();
const userGames = new Map();

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const GHOST_DEPTH = parseInt(process.env.GHOST_STOCKFISH_DEPTH || "15", 10);
const GHOST_CHARGES_PER_PLAYER = 3;

async function getBestMove(fen, depth) {
    return new Promise((resolve, reject) => {
        const encodedFen = encodeURIComponent(fen);
        const url = `https://stockfish.online/api/s/v2.php?fen=${encodedFen}&depth=${depth}`;
        
        const https = require('https');
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.success && json.bestmove) {
                        const parts = json.bestmove.split(" ");
                        const best = parts[1];
                        if (best && best !== "(none)") {
                            return resolve(best);
                        }
                    }
                    reject(new Error("Invalid response from Stockfish API"));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}


async function getAiSummary(pgn, white, black) {
    if (!openai) return null;
    try {
        const prompt = `You are a chess grandmaster commentator. Analyze this chess game PGN and provide a brief, engaging post-game summary (3-4 sentences) covering: key turning points, any major blunders, brilliant moves, and how the game was decided. Be specific about move numbers and piece names. White: ${white}, Black: ${black}.\n\nPGN:\n${pgn}`;
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 400,
            temperature: 0.7,
        });
        return completion.choices[0]?.message?.content?.trim() || null;
    } catch {
        return null;
    }
}

io.on("connection", (socket) => {
    socket.emit("auth-success", { user: socket.user });

    socket.on("create-game", () => {
        const gameId = crypto.randomBytes(4).toString("hex");
        const chess = new Chess();

        games.set(gameId, {
            chess,
            players: {
                white: { socketId: socket.id, user: socket.user },
                black: null,
            },
            spectators: [],
            messages: [],
            ghostCharges: {
                white: GHOST_CHARGES_PER_PLAYER,
                black: GHOST_CHARGES_PER_PLAYER,
            },
        });
        userGames.set(socket.id, gameId);

        socket.join(gameId);
        socket.emit("game-created", { gameId });
        socket.emit("ghost-charge-update", { charges: GHOST_CHARGES_PER_PLAYER });
    });

    socket.on("join-game", ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) {
            return socket.emit("error", { message: "Game not found" });
        }

        if (
            (game.players.white && game.players.white.socketId === socket.id) ||
            (game.players.black && game.players.black.socketId === socket.id)
        ) {
            return socket.emit("error", { message: "You are already in this game" });
        }

        let assignedColor = null;
        if (!game.players.white) {
            game.players.white = { socketId: socket.id, user: socket.user };
            assignedColor = "white";
        } else if (!game.players.black) {
            game.players.black = { socketId: socket.id, user: socket.user };
            assignedColor = "black";
        } else {
            game.spectators.push({ socketId: socket.id, user: socket.user });
            userGames.set(socket.id, gameId);
            socket.join(gameId);
            return socket.emit("game-joined", {
                gameId,
                role: "spectator",
                fen: game.chess.fen(),
                white: game.players.white.user,
                black: game.players.black.user,
                messages: game.messages,
            });
        }

        userGames.set(socket.id, gameId);
        socket.join(gameId);
        socket.emit("game-joined", {
            gameId,
            role: "player",
            color: assignedColor,
            fen: game.chess.fen(),
            messages: game.messages,
        });

        socket.emit("ghost-charge-update", {
            charges: game.ghostCharges[assignedColor],
        });

        if (game.players.white && game.players.black) {
            const currentTurn = game.chess.turn() === "w" ? "white" : "black";
            io.to(gameId).emit("game-started", {
                fen: game.chess.fen(),
                turn: currentTurn,
                white: game.players.white.user,
                black: game.players.black.user,
            });
        }
    });

    socket.on("move", (data) => {
        const gameId = userGames.get(socket.id);
        if (!gameId) return socket.emit("error", { message: "You are not in a game" });

        const game = games.get(gameId);
        if (!game) return socket.emit("error", { message: "Game not found" });

        const isWhite = game.players.white && game.players.white.socketId === socket.id;
        const isBlack = game.players.black && game.players.black.socketId === socket.id;

        if (!isWhite && !isBlack) {
            return socket.emit("error", { message: "Spectators cannot move" });
        }

        if (game.chess.isGameOver()) {
            return socket.emit("error", { message: "The game is already over" });
        }

        if (!data || typeof data !== "object" || !data.from || !data.to) {
            return socket.emit("error", { message: "Invalid move data" });
        }

        const turn = game.chess.turn() === "w" ? "white" : "black";
        if ((isWhite && turn !== "white") || (isBlack && turn !== "black")) {
            return socket.emit("error", { message: "It is not your turn" });
        }

        if (!game.players.white || !game.players.black) {
            return socket.emit("error", { message: "Waiting for opponent to join" });
        }

        try {
            const move = game.chess.move(data);

            io.to(gameId).emit("move-made", {
                move,
                fen: game.chess.fen(),
                turn: game.chess.turn() === "w" ? "white" : "black",
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

                const pgn = game.chess.pgn();
                const whiteName = game.players.white.user.username;
                const blackName = game.players.black.user.username;

                updateRatings(game, winner, reason).then((ratingUpdate) => {
                    io.to(gameId).emit("game-over", {
                        winner,
                        reason,
                        ratingUpdate,
                    });

                    getAiSummary(pgn, whiteName, blackName).then((summary) => {
                        io.to(gameId).emit("ai-summary", {
                            summary: summary || "Game analysis is currently unavailable.",
                        });
                    });
                });
            }
        } catch (err) {
            socket.emit("error", { message: "Invalid move" });
        }
    });

    socket.on("ghost-move", async () => {
        const gameId = userGames.get(socket.id);
        if (!gameId) return socket.emit("error", { message: "You are not in a game" });

        const game = games.get(gameId);
        if (!game) return socket.emit("error", { message: "Game not found" });

        if (game.chess.isGameOver()) {
            return socket.emit("error", { message: "The game is already over" });
        }

        if (!game.players.white || !game.players.black) {
            return socket.emit("error", { message: "Waiting for opponent to join" });
        }

        const isWhite = game.players.white && game.players.white.socketId === socket.id;
        const isBlack = game.players.black && game.players.black.socketId === socket.id;

        if (!isWhite && !isBlack) {
            return socket.emit("error", { message: "Spectators cannot use Ghost Mode" });
        }

        const turn = game.chess.turn() === "w" ? "white" : "black";
        const playerColor = isWhite ? "white" : "black";

        if (turn !== playerColor) {
            return socket.emit("error", { message: "It is not your turn" });
        }

        if (game.ghostCharges[playerColor] <= 0) {
            return socket.emit("error", { message: "No Ghost Mode charges remaining" });
        }

        game.ghostCharges[playerColor] -= 1;
        const remaining = game.ghostCharges[playerColor];

        socket.emit("ghost-charge-update", { charges: remaining });

        try {
            const bestMoveUci = await getBestMove(game.chess.fen(), GHOST_DEPTH);

            const from = bestMoveUci.slice(0, 2);
            const to = bestMoveUci.slice(2, 4);
            const promotion = bestMoveUci.length === 5 ? bestMoveUci[4] : "q";

            const move = game.chess.move({ from, to, promotion });

            if (!move) {
                game.ghostCharges[playerColor] += 1;
                socket.emit("ghost-charge-update", { charges: game.ghostCharges[playerColor] });
                return socket.emit("error", { message: "Ghost Mode could not find a valid move" });
            }

            io.to(gameId).emit("move-made", {
                move,
                fen: game.chess.fen(),
                turn: game.chess.turn() === "w" ? "white" : "black",
            });

            if (game.chess.isGameOver()) {
                let reason = "unknown";
                if (game.chess.isCheckmate()) reason = "checkmate";
                else if (game.chess.isStalemate()) reason = "stalemate";
                else if (game.chess.isDraw()) reason = "draw";

                let winner = "none";
                if (reason === "checkmate") winner = playerColor;

                const pgn = game.chess.pgn();
                const whiteName = game.players.white.user.username;
                const blackName = game.players.black.user.username;

                updateRatings(game, winner, reason).then((ratingUpdate) => {
                    io.to(gameId).emit("game-over", { winner, reason, ratingUpdate });

                    getAiSummary(pgn, whiteName, blackName).then((summary) => {
                        io.to(gameId).emit("ai-summary", {
                            summary: summary || "Game analysis is currently unavailable.",
                        });
                    });
                });
            }
        } catch (err) {
            game.ghostCharges[playerColor] += 1;
            socket.emit("ghost-charge-update", { charges: game.ghostCharges[playerColor] });
            socket.emit("error", { message: "Ghost Mode failed. Please try again." });
        }
    });

    socket.on("send-message", ({ text }) => {
        const gameId = userGames.get(socket.id);
        if (!gameId) return;
        const game = games.get(gameId);
        if (!game) return;

        const isWhite = game.players.white && game.players.white.socketId === socket.id;
        const isBlack = game.players.black && game.players.black.socketId === socket.id;

        const message = {
            id: Date.now() + Math.random(),
            user: socket.user,
            text,
            time: new Date().toISOString(),
            isSpectator: !isWhite && !isBlack,
        };

        game.messages.push(message);
        io.to(gameId).emit("receive-message", message);
    });

    socket.on("send-reaction", ({ emoji }) => {
        const gameId = userGames.get(socket.id);
        if (!gameId) return;
        io.to(gameId).emit("receive-reaction", { user: socket.user, emoji });
    });

    const handlePlayerLeave = () => {
        const gameId = userGames.get(socket.id);
        if (!gameId) return;

        const game = games.get(gameId);
        if (game) {
            const wasWhite = game.players.white && game.players.white.socketId === socket.id;
            const wasBlack = game.players.black && game.players.black.socketId === socket.id;
            const wasPlayer = wasWhite || wasBlack;

            const savedWhite = game.players.white;
            const savedBlack = game.players.black;
            const bothPlayersWerePresent = savedWhite && savedBlack;

            if (wasWhite) {
                game.players.white = null;
            } else if (wasBlack) {
                game.players.black = null;
            } else {
                game.spectators = game.spectators.filter((s) => s.socketId !== socket.id);
            }

            if (wasPlayer && bothPlayersWerePresent && !game.chess.isGameOver()) {
                const winner = wasWhite ? "black" : "white";

                const savedGame = {
                    players: {
                        white: savedWhite,
                        black: savedBlack,
                    },
                };

                updateRatings(savedGame, winner, "abandonment").then((ratingUpdate) => {
                    io.to(gameId).emit("game-over", {
                        winner,
                        reason: "abandonment",
                        ratingUpdate,
                        message: `${socket.user.username} left the game. ${winner} wins!`,
                    });

                    const pgn = game.chess.pgn();
                    if (pgn) {
                        getAiSummary(pgn, savedWhite.user.username, savedBlack.user.username).then((summary) => {
                            io.to(gameId).emit("ai-summary", {
                                summary: summary || "Game analysis is currently unavailable.",
                            });
                        });
                    }
                });
            } else if (wasPlayer) {
                io.to(gameId).emit("player-disconnected", {
                    message: `${socket.user.username} has disconnected.`,
                });
            }

            if (
                !game.players.white &&
                !game.players.black &&
                game.spectators.length === 0
            ) {
                games.delete(gameId);
            }
        }
        userGames.delete(socket.id);
    };

    socket.on("leave-game", () => {
        handlePlayerLeave();
    });

    socket.on("disconnect", () => {
        handlePlayerLeave();
    });
});

async function updateRatings(game, winner, reason) {
    try {
        const whiteUser = await User.findById(game.players.white.user._id);
        const blackUser = await User.findById(game.players.black.user._id);

        if (!whiteUser || !blackUser) return null;

        const result = winner === "none" ? "draw" : winner;
        const elo = calculateElo(whiteUser.rating, blackUser.rating, result);

        whiteUser.rating = elo.newWhiteRating;
        if (winner === "white") whiteUser.wins += 1;
        else if (winner === "black") whiteUser.losses += 1;
        else whiteUser.draws += 1;

        blackUser.rating = elo.newBlackRating;
        if (winner === "black") blackUser.wins += 1;
        else if (winner === "white") blackUser.losses += 1;
        else blackUser.draws += 1;

        await whiteUser.save();
        await blackUser.save();

        return {
            white: {
                oldRating: elo.newWhiteRating - elo.whiteChange,
                newRating: elo.newWhiteRating,
                change: elo.whiteChange,
            },
            black: {
                oldRating: elo.newBlackRating - elo.blackChange,
                newRating: elo.newBlackRating,
                change: elo.blackChange,
            },
        };
    } catch (err) {
        return null;
    }
}

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chess-game";

mongoose
    .connect(MONGO_URI)
    .then(() => {
        server.listen(PORT, () => {});
    })
    .catch((err) => {
        process.exit(1);
    });