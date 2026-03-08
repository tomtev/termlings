import { error } from '@sveltejs/kit';
import { renderSVG, renderLayeredSVG, getAvatarCSS, traitsFromName, encodeDNA } from 'termlings';
import type { RequestHandler } from './$types';

const DNA_RE = /^[0-9a-fA-F]{6,7}$/;

function resolveDNA(input: string): string {
  if (DNA_RE.test(input)) return input.toLowerCase();
  const name = decodeURIComponent(input.replace(/\+/g, ' '));
  return encodeDNA(traitsFromName(name));
}

export const GET: RequestHandler = async ({ params, url }) => {
  const input = params.input;
  if (!input) {
    error(400, 'Missing DNA or name.');
  }

  const dna = resolveDNA(input);

  const size = Math.min(Math.max(parseInt(url.searchParams.get('size') ?? '10', 10), 1), 50);
  const padding = Math.min(Math.max(parseInt(url.searchParams.get('padding') ?? '1', 10), 0), 10);
  const bgParam = url.searchParams.get('bg');
  const background = bgParam === 'none' ? null : bgParam ? `#${bgParam}` : 'auto';
  const animated = url.searchParams.get('animated') === 'true';
  const bw = url.searchParams.get('bw') === 'true';

  if (!animated) {
    const frame = parseInt(url.searchParams.get('frame') ?? '0', 10);
    const svg = renderSVG(dna, size, frame, background, padding, bw);
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Animated: layered SVG with CSS
  const { svg: rawSvg, legFrames, bgHex } = renderLayeredSVG(dna, size, bw, padding);
  const css = getAvatarCSS();

  const walking = url.searchParams.get('walking') === 'true';
  const talking = url.searchParams.get('talking') === 'true';
  const waving = url.searchParams.get('waving') === 'true';
  const backside = url.searchParams.get('backside') === 'true';
  const idle = url.searchParams.get('idle') !== 'false';

  const classes = [
    'tg-avatar',
    idle ? 'idle' : '',
    walking ? 'walking' : '',
    talking && !backside ? 'talking' : '',
    waving ? 'waving' : '',
    backside ? 'backside' : '',
    legFrames === 3 ? 'walk-3f' : '',
  ].filter(Boolean).join(' ');

  const widthMatch = rawSvg.match(/width="(\d+)"/);
  const heightMatch = rawSvg.match(/height="(\d+)"/);
  const w = widthMatch ? parseInt(widthMatch[1], 10) : 90;
  const h = heightMatch ? parseInt(heightMatch[1], 10) : 90;

  const resolvedBg = background === 'auto' ? bgHex : background;
  const bgRect = resolvedBg ? `<rect width="${w}" height="${h}" fill="${resolvedBg}"/>` : '';

  const styledSvg = rawSvg.replace(
    '<svg ',
    `<svg class="${classes}" `
  ).replace(
    '>',
    `><defs><style>${css}</style></defs>${bgRect}`,
  );

  return new Response(styledSvg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
