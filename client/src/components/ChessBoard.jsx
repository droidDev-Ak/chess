import { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function ChessBoardComponent({
  fen,
  playerColor,
  socket,
  isConnected,
  role,
}) {
  const initialFen = !fen || fen === "start" ? START_FEN : fen;
  const [displayFen, setDisplayFen] = useState(initialFen);

  // Sync local display state whenever the confirmed server FEN changes
  useEffect(() => {
    if (fen && fen !== "start") {
      setDisplayFen(fen);
    } else if (fen === "start") {
      setDisplayFen(START_FEN);
    }
  }, [fen]);

  // react-chessboard v5: onPieceDrop receives { piece, sourceSquare, targetSquare }
  const onDrop = ({ sourceSquare, targetSquare }) => {
    console.log("🎯 onDrop:", sourceSquare, "->", targetSquare);

    if (role === "spectator") return false;
    if (!isConnected) return false;
    if (!socket) return false;

    const chessValidator = new Chess();
    try {
      const currentFen = !fen || fen === "start" ? START_FEN : fen;
      chessValidator.load(currentFen);
    } catch (e) {
      console.error("Error loading FEN:", e);
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
    console.log("📡 Sending move:", { from: sourceSquare, to: targetSquare });
    socket.emit("move", { from: sourceSquare, to: targetSquare, promotion: "q" });

    return true;
  };

  // react-chessboard v5: ALL config goes inside the options prop
  const boardOptions = {
    id: "main-board",
    position: displayFen,
    onPieceDrop: onDrop,
    allowDragging: true,
    boardOrientation: playerColor === "black" ? "black" : "white",
    animationDurationInMs: 200,
  };

  return (
    <div style={{ width: "100%", maxWidth: "600px", aspectRatio: "1 / 1", margin: "0 auto" }}>
      <Chessboard options={boardOptions} />
    </div>
  );
}