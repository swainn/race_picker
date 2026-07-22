import type { ModeViewProps } from '../types';
import { invadersTheme } from '../themes';
import { SpaceModeShell } from './SpaceModeShell';

export function InvadersMode(props: ModeViewProps) {
  return (
    <SpaceModeShell
      variant="invaders"
      theme={invadersTheme}
      startLabel="👾 Start Invasion"
      resetLabel="🔄 Reset"
      headline="ELIMINATED!"
      finalsHeadline="👾 LAST SURVIVOR 👾"
      nextLabel="👾 Next Wave"
      {...props}
    />
  );
}
