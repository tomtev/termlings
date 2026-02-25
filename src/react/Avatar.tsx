import { useMemo } from 'react';
import { encodeDNA, traitsFromName, renderLayeredSVG, getAvatarCSS } from '../index.ts';

export interface AvatarProps {
  dna?: string;
  name?: string;
  size?: 'sm' | 'lg' | 'xl';
  walking?: boolean;
  talking?: boolean;
  waving?: boolean;
  backside?: boolean;
  bw?: boolean;
}

let cssInjected = false;

function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'tg-avatar-css';
  style.textContent = getAvatarCSS();
  document.head.appendChild(style);
}

const PX_SIZES = { sm: 3, lg: 8, xl: 14 } as const;

export function Avatar({ dna, name, size = 'lg', walking = false, talking = false, waving = false, backside = false, bw = false }: AvatarProps) {
  injectCSS();
  const resolvedDna = useMemo(() => dna ?? encodeDNA(traitsFromName(name ?? 'agent')), [dna, name]);
  // Deterministic idle delay derived from DNA to avoid SSR hydration mismatch
  const idleDelay = useMemo(() => {
    let h = 0;
    for (let i = 0; i < resolvedDna.length; i++) {
      h = resolvedDna.charCodeAt(i) + ((h << 5) - h);
    }
    return (Math.abs(h) % 3000) / 1000; // 0-3 seconds
  }, [resolvedDna]);
  const { svg, legFrames } = useMemo(() => renderLayeredSVG(resolvedDna, PX_SIZES[size], bw), [resolvedDna, size, bw]);
  const idle = !walking && !talking && !waving;

  const cls = [
    'tg-avatar',
    idle && 'idle',
    walking && 'walking',
    talking && !backside && 'talking',
    waving && 'waving',
    backside && 'backside',
    legFrames === 3 && 'walk-3f',
    legFrames === 4 && 'walk-4f',
    size === 'sm' && 'tg-avatar-sm',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        '--tg-idle-delay': `${idleDelay}s`,
        ...(size === 'sm' ? { width: 27, height: 27, overflow: 'hidden' } : {}),
      } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
