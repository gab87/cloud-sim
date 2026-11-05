/**
 * Best-effort client-side filter for offensive / vulgar names (EN, IT, FR, ES, DE).
 * Words are stored lowercase, without accents.
 *
 * - WORDS and ROOTS with 4+ letters are blocked anywhere inside a word of the name, even glued
 *   to other letters ("stocazzo", "fuckyou", "superstronzo").
 * - Shorter WORDS ("ass", "cum", "sex", ...) only match a whole word, otherwise names like
 *   "Cassandra", "Lucas" or "Sexton" would be rejected.
 * - ALLOWED lists legitimate names/words that happen to contain a banned term
 *   (the "Scunthorpe problem"): extend it if a real name is rejected.
 */
const WORDS: Record<string, string[]> = {
  en: [
    'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole',
    'ass', 'arse', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker', 'prick',
    'bollocks', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'nazi', 'nazis', 'hitler', 'porn', 'sex', 'rape',
    'rapist', 'cum', 'dildo', 'tits', 'boobs', 'idiot', 'moron', 'stupid', 'jackass', 'douchebag',
  ],
  it: [
    'cazzo', 'cazzone', 'minchia', 'merda', 'stronzo', 'stronza', 'puttana', 'troia', 'zoccola',
    'vaffanculo', 'fanculo', 'culo', 'coglione', 'cogliona', 'figa', 'fica', 'mignotta', 'frocio',
    'ricchione', 'porcodio', 'dioporco', 'porcamadonna', 'figliodiputtana', 'bastardo', 'bastarda', 'pirla', 'cretino', 'cretina', 'deficiente',
    'idiota', 'scemo', 'scema', 'stupido', 'stupida', 'ritardato', 'sborra', 'pompino', 'segaiolo',
    'bocchinaro', 'puttaniere', 'cornuto',
  ],
  fr: [
    'merde', 'putain', 'pute', 'salope', 'connard', 'connasse', 'conne', 'encule', 'nique', 'niquer',
    'ntm', 'batard', 'couille', 'couilles', 'chatte', 'foutre', 'pede', 'tapette', 'bougnoule',
    'enfoire', 'salaud', 'poufiasse', 'branleur', 'cul', 'abruti', 'debile',
  ],
  es: [
    'mierda', 'puta', 'puto', 'joder', 'jodete', 'cabron', 'pendejo', 'pendeja', 'gilipollas',
    'polla', 'chinga', 'chingada', 'chingar', 'culero', 'culo', 'maricon', 'zorra', 'hijoputa',
    'hijodeputa', 'malparido', 'mamon', 'carajo', 'pinche', 'culiao', 'imbecil', 'subnormal',
  ],
  de: [
    'scheisse', 'arsch', 'arschloch', 'fick', 'ficken', 'ficker', 'hurensohn', 'hure', 'fotze',
    'schlampe', 'wichser', 'wixer', 'schwanz', 'muschi', 'schwuchtel', 'neger', 'spast', 'spasti',
    'missgeburt', 'mistkerl', 'drecksau', 'hackfresse', 'kacke', 'pisser', 'vollidiot',
  ],
};

const ROOTS = [
  // en
  'fuck', 'bitch', 'whore', 'asshole', 'motherf', 'dickhead',
  // it
  'cazzone', 'stronz', 'vaffancul', 'fancul', 'puttan', 'coglion', 'minchi', 'porcodio', 'sborr',
  'troion', 'zoccolon',
  // fr
  'encul', 'salope', 'putain', 'poufiasse',
  // es
  'hijodeputa', 'hijoputa', 'gilipollas', 'pendej', 'cabron', 'maricon', 'chingad', 'mierd',
  // de
  'hurensohn', 'arschloch', 'scheiss', 'fotze', 'wichser', 'schlampe', 'schwuchtel',
];

/** legitimate words/names containing a banned term (compared on the whole normalised word) */
const ALLOWED = new Set([
  // cock / cunt / arse / arsch / rape / pede / tits / shit / prick
  'hancock', 'peacock', 'babcock', 'hitchcock', 'woodcock', 'alcock', 'cockburn', 'cockerell',
  'scunthorpe', 'marseille', 'marseilles', 'arschavin', 'draper', 'grapes', 'pedersen', 'pederson',
  'titsworth', 'shittu', 'shitake', 'prickett', 'prickly',
  // conne / cazzo / culo / puto / puta / pute / figa / fica / fick
  'connell', 'oconnell', 'connelly', 'connery', 'connect', 'cazzola', 'cazzolato', 'culotta',
  'caputo', 'deputato', 'deputata', 'reputation', 'computer', 'putative', 'figaro', 'pacifica',
  'fickett', 'fickle', 'troiano', 'troiani',
]);

/** terms of 4+ letters that are too common inside real names to be matched as substrings */
const FORCE_WHOLE_WORD = new Set(['nazi', 'nazis']); // Ignazio, Nazih, Nazim, ...

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b' };

/** lowercase, no accents, ß → ss, leetspeak → letters */
const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[0-9!@$]/g, (c) => LEET[c] ?? c);

/** collapses repeated letters ("fuuuck" → "fuck") */
const squeeze = (s: string) => s.replace(/(.)\1+/g, '$1');

const ALL_WORDS = Object.values(WORDS).flat();
const BANNED_WORDS = new Set(ALL_WORDS);
const isWholeWordOnly = (w: string) => w.length < 4 || FORCE_WHOLE_WORD.has(w);
const WHOLE_WORD_ONLY = ALL_WORDS.filter(isWholeWordOnly);
const SUBSTRING_TERMS = [...new Set([...ALL_WORDS.filter((w) => !isWholeWordOnly(w)), ...ROOTS])];

// Stretched spellings ("fuuuck", "cazzzzzo") are matched by also comparing:
// - with runs of 3+ letters reduced to 2 ("cazzzzzo" → "cazzo")
// - with all repeated letters collapsed, only for terms without double letters: squeezing
//   "polla" or "conne" would give "pola" / "cone", which are legitimate names.
const variants = (t: string, term: string) => {
  const v = [t, t.replace(/(.)\1{2,}/g, '$1$1')];
  if (squeeze(term) === term) v.push(squeeze(t));
  return v;
};

function isWordBanned(t: string) {
  if (ALLOWED.has(t)) return false;
  return (
    WHOLE_WORD_ONLY.some((w) => variants(t, w).includes(w)) ||
    SUBSTRING_TERMS.some((term) => variants(t, term).some((v) => v.includes(term)))
  );
}

export function isNameAllowed(name: string) {
  const tokens = normalize(name).split(/[^a-z]+/).filter(Boolean);
  // spelled-out letters ("f u c k", "s.t.r.o.n.z.o") are joined back into a single word;
  // real multi-word names are NOT joined ("Rosa Lope" would otherwise contain "salope")
  const letters = tokens.filter((t) => t.length === 1);
  if (letters.length >= 3) tokens.push(letters.join(''));
  if (tokens.some(isWordBanned)) return false;
  // multi-word expressions ("porco dio", "hijo de puta"): exact match only on 2–3 adjacent words
  for (let n = 2; n <= 3; n++)
    for (let i = 0; i + n <= tokens.length; i++) if (BANNED_WORDS.has(tokens.slice(i, i + n).join(''))) return false;
  return true;
}
