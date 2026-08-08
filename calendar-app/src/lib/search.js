/**
 * Title matching for the search box.
 *
 * A plain substring test is wrong here: RISC-V group names are dense with
 * acronyms, so typing 'AME' matched 'RV Par-ame-ter SIG' as readily as
 * 'RV AME TG'. Known acronym terms are treated as acronym-style searches and
 * must match a whole token, while regular terms still match at word starts.
 */

const EXACT_ACRONYM_TERMS = new Set(['ame', 'csc', 'hc', 'sig', 'tg']);
const ALIASES = new Map([
  ['fp', ['floating', 'point']],
  ['rv', ['risc', 'v']],
]);

/** Split on anything that is not a letter or digit: 'RV CoVE/CoVE-IO TGs' → 4 tokens. */
function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

function matchesWord(word, term) {
  if (!EXACT_ACRONYM_TERMS.has(term)) return word.startsWith(term);
  return word === term || word === `${term}s`;
}

function parseQuery(query) {
  const out = [];
  const re = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = re.exec(String(query ?? '')))) {
    const raw = match[1] ?? match[2];
    const words = tokenize(raw);
    if (!words.length) continue;
    if (match[1]) {
      out.push({ type: 'phrase', words });
      continue;
    }
    const alias = ALIASES.get(words.join(' '));
    if (alias) out.push({ type: 'all', words: alias });
    else out.push(...words.map((word) => ({ type: 'term', word })));
  }
  return out;
}

function hasPhrase(words, phrase) {
  if (phrase.length > words.length) return false;
  for (let i = 0; i <= words.length - phrase.length; i += 1) {
    if (phrase.every((term, j) => words[i + j] === term)) return true;
  }
  return false;
}

/**
 * True when every term in the query matches some word in the title.
 *
 * Multi-term queries are ANDed and order-independent, so 'crypto sig' and
 * 'sig crypto' both find 'RV Joint Crypto SIG/TGs'.
 */
export function matchesQuery(title, query) {
  const terms = parseQuery(query);
  if (!terms.length) return true;

  const words = tokenize(title);
  return terms.every((term) => {
    if (term.type === 'phrase') return hasPhrase(words, term.words);
    if (term.type === 'all') {
      return term.words.every((aliasWord) =>
        words.some((word) => matchesWord(word, aliasWord)),
      );
    }
    return words.some((word) => matchesWord(word, term.word));
  });
}
