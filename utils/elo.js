

const K = 32;

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function calculateElo(whiteRating, blackRating, result) {
  const expectedWhite = expectedScore(whiteRating, blackRating);
  const expectedBlack = expectedScore(blackRating, whiteRating);

  let actualWhite, actualBlack;

  if (result === "white") {
    actualWhite = 1;
    actualBlack = 0;
  } else if (result === "black") {
    actualWhite = 0;
    actualBlack = 1;
  } else {
    
    actualWhite = 0.5;
    actualBlack = 0.5;
  }

  const whiteChange = Math.round(K * (actualWhite - expectedWhite));
  const blackChange = Math.round(K * (actualBlack - expectedBlack));

  return {
    newWhiteRating: Math.max(100, whiteRating + whiteChange), 
    newBlackRating: Math.max(100, blackRating + blackChange),
    whiteChange,
    blackChange,
  };
}

module.exports = { calculateElo };
