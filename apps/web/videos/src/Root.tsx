import type {FC} from 'react';
import {Composition} from 'remotion';
import {FakeTerminalDemo, FAKE_TERMINAL_DURATION_FRAMES} from './FakeTerminalDemo';

export const Root: FC = () => {
  return (
    <>
      <Composition
        id="FakeTerminalDemo"
        component={FakeTerminalDemo}
        durationInFrames={FAKE_TERMINAL_DURATION_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
