import type { CSSProperties } from 'react';
import { useWinnerLifecycle } from '../../../hooks/useWinnerLifecycle';
import type { WinnerDialogProps } from './types';
import './WinnerDialog.css';

const DEFAULT_AUTO_MINIMIZE_MS = 3000;

export function WinnerDialog(props: WinnerDialogProps) {
  const {
    theme,
    show,
    isFinals,
    goldTreatment,
    winner,
    headline,
    finalsHeadline,
    detailsNode,
    effects,
    nextLabel = '▶ Next',
    finalsLabel = '🏆 Final Standings',
    minimizedNextLabel,
    minimizedFinalsLabel = '🏆 Standings',
    onNext,
    onShowFinalStandings,
    onReplayStart,
    autoMinimizeMs = DEFAULT_AUTO_MINIMIZE_MS,
  } = props;

  const { phase, minimize, expand } = useWinnerLifecycle({
    show,
    autoMinimizeMs,
    onMinimize: onReplayStart,
  });

  if (phase === 'hidden') return null;

  const gold = goldTreatment ?? isFinals;

  const themeStyle: CSSProperties = {
    '--wd-accent': theme.accent,
    '--wd-accent-soft': theme.accentSoft,
    '--wd-bg-gradient': theme.bgGradient,
    '--wd-finals-accent': theme.finalsAccent,
    '--wd-finals-accent-soft': theme.finalsAccentSoft,
    '--wd-finals-bg-gradient': theme.finalsBgGradient,
    '--wd-text': theme.textColor ?? '#fff',
    '--wd-finals-text': theme.finalsTextColor ?? theme.textColor ?? '#fff',
    '--wd-headline': theme.headlineColor ?? theme.accent,
    '--wd-finals-headline': theme.finalsHeadlineColor ?? theme.finalsAccent,
    '--wd-font-family': theme.fontFamily ?? 'inherit',
    '--wd-letter-spacing': theme.letterSpacing ?? 'normal',
  } as CSSProperties;

  const primaryAction = isFinals ? onShowFinalStandings : onNext;
  const primaryLabel = isFinals ? finalsLabel : nextLabel;
  const minimizedLabel = isFinals
    ? minimizedFinalsLabel
    : (minimizedNextLabel ?? nextLabel);
  const minimizedAction = isFinals ? onShowFinalStandings : onNext;
  const buttonStyle = theme.buttonStyle ?? 'solid';
  const buttonClass = `winner-dialog__primary-btn winner-dialog__primary-btn--${buttonStyle}`;

  if (phase === 'minimized') {
    return (
      <div
        className="winner-dialog winner-dialog--minimized"
        data-finals={isFinals}
        data-gold={gold}
        data-button-style={buttonStyle}
        style={themeStyle}
        onClick={expand}
        role="button"
        tabIndex={0}
      >
        <span className="winner-dialog__pill-text">
          {gold ? '🏆' : '✓'} {winner.name}
        </span>
        <button
          type="button"
          className={`winner-dialog__pill-action winner-dialog__pill-action--${buttonStyle}`}
          onClick={(e) => {
            e.stopPropagation();
            minimizedAction();
          }}
        >
          {minimizedLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      className="winner-dialog winner-dialog--expanded"
      data-finals={isFinals}
      data-gold={gold}
      style={themeStyle}
    >
      <div className="winner-dialog__banner">
        <button
          type="button"
          className="winner-dialog__minimize-btn"
          onClick={minimize}
          aria-label="Minimize"
        >
          −
        </button>
        <h2 className="winner-dialog__headline">
          {isFinals ? finalsHeadline : headline}
        </h2>

        {winner.allImages && winner.allImages.length > 0 ? (
          <div className="winner-dialog__images">
            {winner.allImages.map((src, idx) => (
              <div key={idx} className="winner-dialog__avatar winner-dialog__avatar--small" aria-hidden="true">
                <img src={src} alt="" className="winner-dialog__avatar-image" />
              </div>
            ))}
          </div>
        ) : winner.imageDataUrl ? (
          <div className="winner-dialog__avatar" aria-hidden="true">
            <img src={winner.imageDataUrl} alt="" className="winner-dialog__avatar-image" />
          </div>
        ) : null}

        <p className="winner-dialog__name">{winner.name}</p>
        {detailsNode && <div className="winner-dialog__details">{detailsNode}</div>}

        {effects && (
          <div className="winner-dialog__effects" aria-hidden="true">
            {effects.fire && <span className="winner-dialog__effect winner-dialog__effect--fire">🔥</span>}
            {effects.ice && <span className="winner-dialog__effect winner-dialog__effect--ice">❄️</span>}
            {effects.green && <span className="winner-dialog__effect winner-dialog__effect--green">🌿</span>}
            {effects.lightning && <span className="winner-dialog__effect winner-dialog__effect--lightning">⚡</span>}
          </div>
        )}

        <button
          type="button"
          onClick={primaryAction}
          className={buttonClass}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
