const MARKDOWN_LINK_REGEX = /\[(?:\\.|[^\]\\])*\]\((?:\\.|[^\\)])*\)/;
// Allow modern long TLDs such as .systems and punycode labels.
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9-]{2,63}\b([-a-zA-Z0-9()@:%_\+,.~#?&//=]*)/gi;
const TRAILING_PUNCTUATION_REGEX = /[.,!?;:，。！？；：]+$/u;

export function isMarkdownUrl(url: string): boolean {
  return MARKDOWN_LINK_REGEX.test(url);
}

function trimUnmatchedTrailingParentheses(url: string): string {
  let normalized = url;

  while (normalized.endsWith(')')) {
    const openCount = (normalized.match(/\(/g) || []).length;
    const closeCount = (normalized.match(/\)/g) || []).length;

    if (closeCount <= openCount) break;
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function trimTrailingPunctuation(url: string): string {
  // Keep URL-internal commas (e.g. query params), but trim sentence punctuation at the end.
  const withoutPunctuation = url.replace(TRAILING_PUNCTUATION_REGEX, '');
  return trimUnmatchedTrailingParentheses(withoutPunctuation);
}

export function GetUrlsFromString(str: string): string[] | null {
  if (!str) return null;

  const urls = str.match(URL_REGEX);
  if (!urls) return null;

  const uniqueUrls = new Set<string>();
  for (const url of urls) {
    const normalized = trimTrailingPunctuation(url);
    if (normalized && !isMarkdownUrl(normalized)) {
      uniqueUrls.add(normalized);
    }
  }

  return uniqueUrls.size > 0 ? Array.from(uniqueUrls) : null;
}
