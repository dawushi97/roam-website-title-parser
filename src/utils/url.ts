export function isMarkdownUrl(url: string): boolean {
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
  return markdownLinkRegex.test(url);
}

function trimTrailingPunctuation(url: string): string {
  // Keep URL-internal commas (e.g. query params), but trim sentence punctuation at the end.
  return url.replace(/[.,!?;:，。！？；：]+$/u, '');
}

export function GetUrlsFromString(str: string): string[] | null {
  if (!str) return null;

  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+,.~#?&//=]*)/gi;
  const urls = str.match(urlRegex);
  
  if (!urls) return null;

  return Array.from(new Set(urls.map(trimTrailingPunctuation))).filter(url => !isMarkdownUrl(url));
}
