/** Word tokenization for Citrinet forced alignment (display + lookup). */
export function tokenizeWords(text) {
  const out = [];
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    out.push({
      display: m[0],
      lookup: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}
