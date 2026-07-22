import type { ModeViewProps } from '../types';
import { defendersTheme } from '../themes';
import { SpaceModeShell } from './SpaceModeShell';

export function DefendersMode(props: ModeViewProps) {
  return (
    <SpaceModeShell
      variant="defenders"
      theme={defendersTheme}
      startLabel="🛡️ Start Defense"
      resetLabel="🔄 Reset"
      headline="BASE DESTROYED!"
      finalsHeadline="🛡️ LAST DEFENDER 🛡️"
      nextLabel="🛡️ Next Wave"
      {...props}
    />
  );
}
