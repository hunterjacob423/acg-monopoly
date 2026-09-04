import { useEffect, useState } from "react";

/**
 * Which of a 3x3 grid's cells carry a pip, for each face. Drawn rather than
 * printed as a numeral because a tumbling numeral just looks like flickering
 * text, whereas pips read as a die turning over.
 */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** How often the faces change while the roll is in the air. */
const FLICKER_MS = 70;

function Face({ value, rolling, delay }: { value: number; rolling: boolean; delay: number }) {
  return (
    <div className={`die${rolling ? " tumbling" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={PIPS[value]?.includes(cell) ? "pip" : "pip empty"} />
      ))}
    </div>
  );
}

/**
 * The pair of dice in the middle of the board.
 *
 * While `rolling` is true the faces are random and mean nothing — the real
 * values are held back by useGame until the tumble finishes, so nobody can read
 * the result early, and the piece does not set off before the dice have settled.
 */
export function Dice({ die1, die2, rolling }: { die1: number; die2: number; rolling: boolean }) {
  const [shown, setShown] = useState<[number, number]>([die1, die2]);

  useEffect(() => {
    if (!rolling) {
      setShown([die1, die2]);
      return;
    }
    const roll = () => 1 + Math.floor(Math.random() * 6);
    const id = setInterval(() => setShown([roll(), roll()]), FLICKER_MS);
    return () => clearInterval(id);
  }, [rolling, die1, die2]);

  // Nothing has been rolled yet this game.
  if (!rolling && (die1 < 1 || die2 < 1)) return null;

  return (
    <div className={`dice${rolling ? " rolling" : ""}`}>
      <Face value={shown[0]} rolling={rolling} delay={0} />
      <Face value={shown[1]} rolling={rolling} delay={80} />
    </div>
  );
}
