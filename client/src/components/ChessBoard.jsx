import { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function GhostPip({ filled }) {
    return (
        <motion.div
            animate={{ scale: filled ? 1 : 0.7, opacity: filled ? 1 : 0.35 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: filled
                    ? "linear-gradient(135deg, #a78bfa, #818cf8)"
                    : "rgba(167,139,250,0.25)",
                boxShadow: filled ? "0 0 6px rgba(167,139,250,0.6)" : "none",
            }}
        />
    );
}

export default function ChessBoardComponent({
    fen,
    playerColor,
    socket,
    isConnected,
    role,
    bothPlayersPresent,
    ghostCharges,
    onGhostMove,
    isMyTurn,
    isGhostLoading,
}) {
    const initialFen = !fen || fen === "start" ? START_FEN : fen;
    const [displayFen, setDisplayFen] = useState(initialFen);

    useEffect(() => {
        if (fen && fen !== "start") {
            setDisplayFen(fen);
        } else if (fen === "start") {
            setDisplayFen(START_FEN);
        }
    }, [fen]);

    const onDrop = ({ sourceSquare, targetSquare }) => {
        if (role === "spectator") return false;
        if (!isConnected) return false;
        if (!socket) return false;

        const chessValidator = new Chess();
        try {
            const currentFen = !fen || fen === "start" ? START_FEN : fen;
            chessValidator.load(currentFen);
        } catch (e) {
            return false;
        }

        const piece = chessValidator.get(sourceSquare);
        if (!piece) return false;

        const myColor = playerColor === "black" ? "b" : "w";
        if (piece.color !== myColor) return false;
        if (chessValidator.turn() !== myColor) return false;

        let moveResult;
        try {
            moveResult = chessValidator.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: "q",
            });
            if (!moveResult) return false;
        } catch {
            return false;
        }

        setDisplayFen(chessValidator.fen());
        socket.emit("move", { from: sourceSquare, to: targetSquare, promotion: "q" });

        return true;
    };

    const boardOptions = {
        id: "main-board",
        position: displayFen,
        onPieceDrop: onDrop,
        allowDragging: bothPlayersPresent && role !== "spectator",
        boardOrientation: playerColor === "black" ? "black" : "white",
        animationDurationInMs: 200,
    };

    const canUseGhost =
        role !== "spectator" &&
        bothPlayersPresent &&
        isMyTurn &&
        ghostCharges > 0 &&
        !isGhostLoading;

    const showGhostButton = role === "player" && playerColor;

    const charges = typeof ghostCharges === "number" ? ghostCharges : 3;

    return (
        <div style={{ width: "100%", maxWidth: "min(600px, 65vh)", margin: "0 auto" }}>
            <Chessboard options={boardOptions} />

            {showGhostButton && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    <motion.button
                        whileHover={canUseGhost ? { scale: 1.04, y: -2 } : {}}
                        whileTap={canUseGhost ? { scale: 0.96 } : {}}
                        animate={
                            isGhostLoading
                                ? { opacity: [1, 0.6, 1], transition: { repeat: Infinity, duration: 1 } }
                                : {}
                        }
                        onClick={canUseGhost ? onGhostMove : undefined}
                        disabled={!canUseGhost}
                        style={{
                            background: canUseGhost
                                ? "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(99,102,241,0.35))"
                                : "rgba(255,255,255,0.04)",
                            border: canUseGhost
                                ? "1px solid rgba(167,139,250,0.45)"
                                : "1px solid rgba(255,255,255,0.07)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            boxShadow: canUseGhost
                                ? "0 0 20px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.08)"
                                : "none",
                            cursor: canUseGhost ? "pointer" : "not-allowed",
                            transition: "all 0.25s ease",
                        }}
                        className="flex items-center gap-3 px-5 py-2.5 rounded-full"
                    >
                        <AnimatePresence mode="wait">
                            {isGhostLoading ? (
                                <motion.span
                                    key="loading"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="text-xl"
                                >
                                    ⚙️
                                </motion.span>
                            ) : (
                                <motion.span
                                    key="ghost"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="text-xl"
                                >
                                    👻
                                </motion.span>
                            )}
                        </AnimatePresence>

                        <span
                            style={{
                                background: canUseGhost
                                    ? "linear-gradient(90deg, #c4b5fd, #818cf8)"
                                    : "rgba(255,255,255,0.25)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                                fontWeight: 700,
                                fontSize: "13px",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                            }}
                        >
                            {isGhostLoading ? "AI Thinking..." : "Ghost Mode"}
                        </span>

                        <div className="flex items-center gap-1.5 ml-1">
                            {[...Array(3)].map((_, i) => (
                                <GhostPip key={i} filled={i < charges} />
                            ))}
                        </div>
                    </motion.button>

                    <motion.p
                        animate={{ opacity: canUseGhost ? 0 : 0.6 }}
                        transition={{ duration: 0.2 }}
                        style={{ fontSize: "11px", color: "rgba(156,163,175,0.7)", pointerEvents: "none" }}
                    >
                        {charges === 0
                            ? "No charges remaining"
                            : !isMyTurn
                            ? "Available on your turn"
                            : !bothPlayersPresent
                            ? "Waiting for opponent"
                            : ""}
                    </motion.p>
                </div>
            )}
        </div>
    );
}