import { marked, type Tokens } from 'marked';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-markdown';

const DOCS_SOURCE_REPO = 'tomtev/termlings';
const DOCS_SOURCE_REF = 'main';
const LOCAL_DOCS_DIR = 'src/content/docs';
const INSTALL_DOC_SLUG = 'install';
const INSTALL_DOC_TITLE = 'Install';

export type DocsSourceConfig = {
  directory: string;
};

export type DocsIndexEntry = {
  slug: string;
  fileName: string;
  title: string;
  path: string;
  rawUrl: string;
  htmlUrl: string;
};

export type DocsArticle = DocsIndexEntry & {
  markdown: string;
  html: string;
};

export type LoadRepoDocsOptions = {
  requestedSlug?: string;
};

export type LoadRepoDocsResult = {
  source: DocsSourceConfig;
  docs: DocsIndexEntry[];
  activeSlug: string | null;
  activeDoc: DocsArticle | null;
};

const EXCLUDED_DOC_SLUGS = new Set(['sim', 'claude', 'hooks', 'inbox', 'email', 'plans']);
const LOCAL_DOC_MODULES = import.meta.glob('/src/content/docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const PRISM_LANGUAGE_ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  yml: 'yaml',
  md: 'markdown',
  text: 'plain',
  plaintext: 'plain'
};

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizePrismLanguage(lang?: string): string {
  if (!lang) {
    return 'plain';
  }

  const normalized = lang.toLowerCase().replace(/^language-/, '').trim();
  if (!normalized) {
    return 'plain';
  }

  return PRISM_LANGUAGE_ALIASES[normalized] ?? normalized;
}

function highlightCodeBlock(code: string, languageHint?: string): { html: string; language: string } {
  const language = normalizePrismLanguage(languageHint);
  if (language === 'plain') {
    return {
      html: escapeHtml(code),
      language
    };
  }

  const grammar = Prism.languages[language];
  if (!grammar) {
    return {
      html: escapeHtml(code),
      language: 'plain'
    };
  }

  try {
    return {
      html: Prism.highlight(code, grammar, language),
      language
    };
  } catch {
    return {
      html: escapeHtml(code),
      language: 'plain'
    };
  }
}

function parseRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid docs repo format: "${repo}". Expected "owner/repo".`);
  }

  return {
    owner: parts[0],
    name: parts[1]
  };
}

function buildGitHubRawUrl(owner: string, name: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${path}`;
}

function buildGitHubHtmlUrl(owner: string, name: string, ref: string, path: string): string {
  return `https://github.com/${owner}/${name}/blob/${ref}/${path}`;
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.md$/i, '');
  const parts = stem.split(/[-_]+/).filter(Boolean);

  return parts
    .map((part) => {
      if (part === part.toUpperCase()) {
        return part;
      }

      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractTitleFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/^\s*#\s+(.+)\s*$/m);
  if (!match) {
    return null;
  }

  const title = match[1]
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();

  return title || null;
}

function getDocsSource(): DocsSourceConfig {
  return {
    directory: LOCAL_DOCS_DIR
  };
}

type MarkdownLinkToken = {
  type?: string;
  href?: string;
  text?: string;
  tokens?: Array<{ type?: string; text?: string }>;
};

function toDocRouteSlug(slug: string): string {
  if (slug === 'termlings') {
    return 'agents';
  }

  return slug;
}

function rewriteInternalDocHref(rawHref: string, availableDocSlugs: Set<string>): string | null {
  const href = rawHref.trim();
  if (!href || href.startsWith('#')) {
    return null;
  }

  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(href, 'https://termlings.local/');
  } catch {
    return null;
  }

  const fileName = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (!/\.md$/i.test(fileName)) {
    return null;
  }

  const normalizedFileSlug = normalizeSlug(fileName);
  const slug =
    normalizedFileSlug === 'readme' && availableDocSlugs.has(INSTALL_DOC_SLUG)
      ? INSTALL_DOC_SLUG
      : normalizedFileSlug;
  if (!availableDocSlugs.has(slug)) {
    return null;
  }

  return `/docs/${encodeURIComponent(toDocRouteSlug(slug))}${parsed.hash ?? ''}`;
}

function markdownToHtml(markdown: string, docs: DocsIndexEntry[]): string {
  const availableDocSlugs = new Set(docs.map((doc) => doc.slug));
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }: Tokens.Code): string => {
    const highlighted = highlightCodeBlock(text, lang);
    return `<pre class="language-${highlighted.language}"><code class="language-${highlighted.language}">${highlighted.html}</code></pre>\n`;
  };

  const rendered = marked.parse(markdown, {
    gfm: true,
    breaks: false,
    renderer,
    walkTokens(token) {
      const linkToken = token as MarkdownLinkToken;
      if (linkToken.type !== 'link' || !linkToken.href) {
        return;
      }

      const rewrittenHref = rewriteInternalDocHref(linkToken.href, availableDocSlugs);
      if (!rewrittenHref) {
        return;
      }

      linkToken.href = rewrittenHref;

      if (linkToken.text && /^[^/\s]+\.md$/i.test(linkToken.text.trim())) {
        linkToken.text = linkToken.text.trim().replace(/\.md$/i, '');
      }

      if (!Array.isArray(linkToken.tokens)) {
        return;
      }

      for (const child of linkToken.tokens) {
        if (child.type !== 'text' || !child.text) {
          continue;
        }

        if (/^[^/\s]+\.md$/i.test(child.text.trim())) {
          child.text = child.text.trim().replace(/\.md$/i, '');
        }
      }
    }
  });

  return typeof rendered === 'string' ? rendered : '';
}

function getSourcePathForFile(fileName: string): string {
  return fileName.toLowerCase() === 'readme.md' ? 'README.md' : `docs/${fileName}`;
}

function docsIndexFromLocalMirror(): DocsIndexEntry[] {
  const { owner, name } = parseRepo(DOCS_SOURCE_REPO);

  return Object.keys(LOCAL_DOC_MODULES)
    .map((modulePath) => modulePath.split('/').at(-1) ?? '')
    .filter((fileName) => fileName.length > 0)
    .map((fileName) => {
      const normalizedFileSlug = normalizeSlug(fileName);
      const slug = normalizedFileSlug === 'readme' ? INSTALL_DOC_SLUG : normalizedFileSlug;
      const title = slug === INSTALL_DOC_SLUG ? INSTALL_DOC_TITLE : titleFromFileName(fileName);
      const sourcePath = getSourcePathForFile(fileName);

      return {
        slug,
        fileName,
        title,
        path: sourcePath,
        rawUrl: buildGitHubRawUrl(owner, name, DOCS_SOURCE_REF, sourcePath),
        htmlUrl: buildGitHubHtmlUrl(owner, name, DOCS_SOURCE_REF, sourcePath)
      };
    })
    .filter((entry) => !EXCLUDED_DOC_SLUGS.has(entry.slug))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadRepoDocs(
  options: LoadRepoDocsOptions = {}
): Promise<LoadRepoDocsResult> {
  const source = getDocsSource();
  const docs = docsIndexFromLocalMirror();

  if (docs.length === 0) {
    return {
      source,
      docs,
      activeSlug: null,
      activeDoc: null
    };
  }

  const requestedSlug = options.requestedSlug ? normalizeSlug(options.requestedSlug) : null;
  const selectedDoc = docs.find((doc) => doc.slug === requestedSlug) ?? docs[0];
  const markdown = LOCAL_DOC_MODULES[`/src/content/docs/${selectedDoc.fileName}`];

  if (typeof markdown !== 'string') {
    throw new Error(`Missing mirrored doc content for ${selectedDoc.fileName}.`);
  }

  const activeDoc: DocsArticle = {
    ...selectedDoc,
    title: extractTitleFromMarkdown(markdown) ?? selectedDoc.title,
    markdown,
    html: markdownToHtml(markdown, docs)
  };

  return {
    source,
    docs,
    activeSlug: activeDoc.slug,
    activeDoc
  };
}
