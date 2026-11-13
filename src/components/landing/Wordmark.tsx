/**
 * "seeaassoonnss": the word "seasons" with every letter after the first said twice.
 * The second letter of each pair is set as a quieter italic echo, so "seasons" still
 * reads in the upright letters. Screen readers get the plain name.
 */
const PAIRS = ["s", "ee", "aa", "ss", "oo", "nn", "ss"];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <span className="sr-only">seeaassoonnss</span>
      <span aria-hidden>
        {PAIRS.map((pair, i) => (
          <span key={i}>
            {pair[0]}
            {pair[1] ? <span className="wordmark-echo">{pair[1]}</span> : null}
          </span>
        ))}
      </span>
    </span>
  );
}
