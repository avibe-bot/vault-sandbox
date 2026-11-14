// Seed-phrase input logic shared with the standard Vault dialog: words, per-word
// suggestions, checksum and the backup quiz. Vendored VERBATIM at build time (a
// tracked, source-hashed release input; nothing is fetched or imported from Avibe at
// runtime) from avibe-bot/avibe ui/src/lib/vaultHdWallet.ts @ 0e96a11743ad5f09dfdb4f3c47129bf6c8decb8f
// (blob sha256 dc105586ef461be0ce4263ece9506bd7acdd912a8a0459062b5ef6a816005fdd), lines
// 28, 48-83, 199-231 and 234-235, joined by one blank line. Only the import lines below
// are local: the same @scure/bip39 English wordlist and checksum, at this repo's lock.
// hdPhrase.test.ts pins the region; `node scripts/hd-phrase-parity.mjs <vaultHdWallet.ts>`
// re-checks it against an upstream copy. Change it upstream first, then re-vendor.
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// BEGIN VENDORED vaultHdWallet.ts sha256:f3552efcc9c79785458cb5a75c68e80ea7a55920ed483d0ffd86bbae83ae7d06
export const HD_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

/** The words as BIP39 reads them: NFKD, lower case, single spaces. */
export function normalizeWords(input: string): string[] {
  return input.normalize('NFKD').toLowerCase().trim().split(/\s+/u).filter(Boolean);
}

export type PhraseCheck =
  | { ok: true; words: string[] }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'count'; count: number }
  | { ok: false; reason: 'unknown-word'; position: number; word: string; suggestions: string[] }
  | { ok: false; reason: 'checksum' };

const WORDS = new Set(wordlist);

/** Words of the list that share the typed word's first letters, the closest first. */
export function suggestWords(word: string, limit = 3): string[] {
  for (let prefix = Math.min(4, word.length); prefix >= 1; prefix -= 1) {
    const head = word.slice(0, prefix);
    const found = wordlist.filter((candidate) => candidate.startsWith(head));
    if (found.length > 0) return found.slice(0, limit);
  }
  return [];
}

/** Checks a pasted phrase word by word, then its checksum. The first unknown word is named. */
export function checkPhrase(input: string): PhraseCheck {
  const words = normalizeWords(input);
  if (words.length === 0) return { ok: false, reason: 'empty' };
  const unknown = words.findIndex((word) => !WORDS.has(word));
  if (unknown >= 0) {
    return { ok: false, reason: 'unknown-word', position: unknown + 1, word: words[unknown], suggestions: suggestWords(words[unknown]) };
  }
  if (!(HD_WORD_COUNTS as readonly number[]).includes(words.length)) return { ok: false, reason: 'count', count: words.length };
  if (!validateMnemonic(words.join(' '), wordlist)) return { ok: false, reason: 'checksum' };
  return { ok: true, words };
}

/** One question of the backup check: which word sits at this (1-based) position. */
export type HdQuestion = { position: number; options: string[]; answer: string };

/** Three positions, each with the right word and two others from the phrase, in random order. */
export function makeQuiz(words: string[], random: () => number = Math.random): HdQuestion[] {
  const positions = new Set<number>();
  while (positions.size < 3) positions.add(1 + Math.floor(random() * words.length));
  const sorted = [...positions].sort((a, b) => a - b);
  const answers = new Set(sorted.map((position) => words[position - 1]));
  // A wrong option is never any row's answer and never repeats across rows (the sandbox's rule), so
  // no row can be passed by recognising a word from another. Draw from the phrase first; a phrase
  // with repeated words runs short, so top up from the BIP39 list.
  const used = new Set(answers);
  const take = (pool: string[]) => {
    const fresh = pool.filter((w) => !used.has(w));
    if (fresh.length === 0) return null;
    const word = fresh[Math.floor(random() * fresh.length)];
    used.add(word);
    return word;
  };
  const phrase = [...new Set(words)];
  return sorted.map((position) => {
    const answer = words[position - 1];
    const decoys: string[] = [];
    while (decoys.length < 2) decoys.push(take(phrase) ?? take(wordlist)!);
    const options = [answer, ...decoys];
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { position, options, answer };
  });
}

/** Whether every question has its answer picked. */
export const quizPassed = (quiz: HdQuestion[], chosen: Record<number, string>) => quiz.every((q) => chosen[q.position] === q.answer);
// END VENDORED
