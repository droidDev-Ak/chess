import { motion, AnimatePresence } from "framer-motion";

const shimmer = {
    animate: {
        backgroundPosition: ["200% 0", "-200% 0"],
        transition: {
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
        },
    },
};

function SkeletonLine({ width = "100%", height = "14px", className = "" }) {
    return (
        <motion.div
            variants={shimmer}
            animate="animate"
            style={{
                width,
                height,
                borderRadius: "6px",
                background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%)",
                backgroundSize: "400% 100%",
            }}
            className={className}
        />
    );
}

function SummarySkeletonLoader() {
    return (
        <div className="space-y-3 mt-2">
            <SkeletonLine width="100%" />
            <SkeletonLine width="90%" />
            <SkeletonLine width="75%" />
        </div>
    );
}

export default function GameOverModal({
    winner,
    ratingUpdate,
    whitePlayer,
    blackPlayer,
    aiSummary,
    summaryLoading,
    onLeave,
}) {
    if (!winner) return null;

    const isWhiteWinner = winner.player === "white";
    const isDraw = winner.player === "none";

    const winnerLabel = isDraw
        ? "It's a Draw!"
        : `${winner.player.charAt(0).toUpperCase() + winner.player.slice(1)} Wins!`;

    const reasonMap = {
        checkmate: "by Checkmate",
        stalemate: "by Stalemate",
        draw: "by Draw",
        abandonment: "by Abandonment",
        unknown: "",
    };

    return (
        <AnimatePresence>
            <motion.div
                key="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl overflow-hidden"
                style={{ backdropFilter: "blur(12px)", background: "rgba(8,8,20,0.75)" }}
            >
                <motion.div
                    key="modal-card"
                    initial={{ opacity: 0, scale: 0.85, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 16 }}
                    transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 }}
                    style={{
                        background: "linear-gradient(145deg, rgba(18,18,40,0.95) 0%, rgba(10,10,28,0.98) 100%)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                        maxWidth: "480px",
                        width: "calc(100% - 32px)",
                    }}
                    className="rounded-2xl p-8 mx-4"
                >
                    <div className="text-center mb-6">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
                            className="text-5xl mb-3"
                        >
                            {isDraw ? "🤝" : isWhiteWinner ? "♔" : "♚"}
                        </motion.div>

                        <motion.h2
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            style={{
                                background: isDraw
                                    ? "linear-gradient(135deg, #60a5fa, #a78bfa)"
                                    : "linear-gradient(135deg, #fbbf24, #f59e0b)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                            }}
                            className="text-4xl font-extrabold mb-1"
                        >
                            {winnerLabel}
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.28 }}
                            className="text-gray-400 text-sm capitalize"
                        >
                            {reasonMap[winner.reason] || ""}
                        </motion.p>
                    </div>

                    {ratingUpdate && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32 }}
                            className="flex justify-center gap-4 mb-6"
                        >
                            {[
                                { label: "White", data: ratingUpdate.white, player: whitePlayer },
                                { label: "Black", data: ratingUpdate.black, player: blackPlayer },
                            ].map(({ label, data, player }) => (
                                <div
                                    key={label}
                                    style={{
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                    className="flex-1 text-center rounded-xl p-3"
                                >
                                    <p className="text-gray-500 text-xs mb-1 truncate">{player?.username}</p>
                                    <p className="text-white text-lg font-bold">{data.newRating}</p>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className={`text-sm font-semibold ${data.change >= 0 ? "text-emerald-400" : "text-red-400"}`}
                                    >
                                        {data.change >= 0 ? "+" : ""}{data.change} ELO
                                    </motion.p>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.38 }}
                        style={{
                            background: "rgba(139,92,246,0.06)",
                            border: "1px solid rgba(139,92,246,0.2)",
                        }}
                        className="rounded-xl p-4 mb-6"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">🤖</span>
                            <span
                                style={{
                                    background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    backgroundClip: "text",
                                }}
                                className="text-sm font-semibold uppercase tracking-widest"
                            >
                                AI Game Analysis
                            </span>
                        </div>

                        {summaryLoading ? (
                            <SummarySkeletonLoader />
                        ) : (
                            <AnimatePresence>
                                <motion.p
                                    key="summary-text"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.6 }}
                                    className="text-gray-300 text-sm leading-relaxed"
                                >
                                    {aiSummary || "Game analysis is currently unavailable."}
                                </motion.p>
                            </AnimatePresence>
                        )}
                    </motion.div>

                    <motion.button
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.44 }}
                        whileHover={{ scale: 1.03, boxShadow: "0 0 24px rgba(96,165,250,0.35)" }}
                        whileTap={{ scale: 0.97 }}
                        onClick={onLeave}
                        style={{
                            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                            boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
                        }}
                        className="w-full py-3 rounded-xl font-bold text-white transition-all duration-200"
                    >
                        Back to Lobby
                    </motion.button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
