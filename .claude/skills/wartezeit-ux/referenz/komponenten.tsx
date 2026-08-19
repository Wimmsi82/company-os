/**
 * Wartezeit-UX Referenzbausteine fuer React 19 + TypeScript + Vite + Tailwind.
 * Kein eigenstaendiges Modul, keine Bibliothek. Bausteine kopieren und an das
 * jeweilige Projekt anpassen (Tokens/Klassennamen ggf. auf projekteigene Werte
 * umstellen, z.B. SkediQ nutzt --brand-primary/--ink/--surface/--line statt der
 * generischen Tailwind-Farben unten).
 *
 * Alle Bausteine: ARIA gemaess SKILL.md, prefers-reduced-motion respektiert,
 * kein Fake-Fortschritt, kein Skeleton unter 400ms ohne Verzoegerung.
 */

import { useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ *
 * useDelayedVisible: verhindert Skeleton-Aufblitzen (harte Regel 2)
 * Zeigt erst nach `delayMs`, haelt danach mindestens `minVisibleMs`.
 * ------------------------------------------------------------------ */
export function useDelayedVisible(
  active: boolean,
  delayMs = 350,
  minVisibleMs = 450,
) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (shownAt.current === null) {
        setVisible(false);
        return;
      }
      const elapsed = Date.now() - shownAt.current;
      const remaining = Math.max(0, minVisibleMs - elapsed);
      const t = setTimeout(() => {
        setVisible(false);
        shownAt.current = null;
      }, remaining);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      shownAt.current = Date.now();
      setVisible(true);
    }, delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs, minVisibleMs]);

  return visible;
}

/* ------------------------------------------------------------------ *
 * usePrefersReducedMotion
 * ------------------------------------------------------------------ */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/* ------------------------------------------------------------------ *
 * Skeleton: Platzhalterflaeche mit Shimmer, respektiert reduced-motion.
 * WICHTIG: width/height so setzen, dass sie dem spaeteren Inhalt
 * entsprechen (viewport-fit: kein Layout-Sprung beim Einblenden).
 * ------------------------------------------------------------------ */
export function Skeleton({ className = '' }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-gray-200 ${
        reduced ? '' : 'animate-pulse'
      } ${className}`}
    />
  );
}

/**
 * SkeletonRegion: Wrapper der die Delay/Mindestdauer-Logik plus die
 * Live-Ansage fuer Screenreader uebernimmt. `active` = laedt gerade.
 */
export function SkeletonRegion({
  active,
  label = 'Daten werden geladen',
  skeleton,
  children,
}: {
  active: boolean;
  label?: string;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  const showSkeleton = useDelayedVisible(active);

  if (active && !showSkeleton) {
    // Unter 350ms: nichts anzeigen (Regel: kein Skeleton unter 400ms)
    return <div aria-busy="true" role="status" className="sr-only" />;
  }

  return (
    <div aria-busy={active || undefined}>
      {showSkeleton ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">{label}</span>
          {skeleton}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Button mit lokalem Ladezustand (Muster 1: 400ms bis 1s)
 * ------------------------------------------------------------------ */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  loading = false,
  loadingLabel = 'Wird verarbeitet',
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60 ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`h-4 w-4 shrink-0 ${reduced ? '' : 'animate-spin'}`}
          aria-hidden="true"
        >
          <path d="M10 3a7 7 0 105.6 2.8" />
        </svg>
      )}
      <span className={loading ? 'sr-only' : undefined}>
        {loading ? loadingLabel : children}
      </span>
      {loading && <span aria-hidden="true">{loadingLabel}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Progressbar: bestimmter Fortschritt (Muster 3). Kein Fake-Fortschritt,
 * `value` MUSS aus echten Daten kommen, sonst unbestimmte Variante nutzen.
 * ------------------------------------------------------------------ */
export function Progressbar({
  value,
  max = 100,
  label,
  etaLabel,
}: {
  value: number;
  max?: number;
  label: string;
  etaLabel?: string;
}) {
  const percent = Math.min(100, Math.round((value / max) * 100));
  return (
    <div role="status" aria-live="polite">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {etaLabel && (
        <p className="mt-1 text-xs text-gray-500">{etaLabel}</p>
      )}
    </div>
  );
}

/**
 * IndeterminateProgress: unbestimmter Fortschritt, wenn der echte Fortschritt
 * nicht bekannt ist. Zeigt NIE eine erfundene Prozentzahl (harte Regel 1).
 */
export function IndeterminateProgress({
  label,
}: {
  label: string;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-32 overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className={`h-full w-1/3 rounded-full bg-blue-600 ${
            reduced ? '' : 'animate-[indeterminate_1.4s_ease-in-out_infinite]'
          }`}
        />
      </div>
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}
/* Tailwind-Keyframe fuer die Zeile oben, projektweit einmal registrieren
   (z.B. in der globalen CSS-Datei):
   @keyframes indeterminate {
     0%   { transform: translateX(-100%); }
     100% { transform: translateX(300%); }
   }
*/

/* ------------------------------------------------------------------ *
 * Stepper: mehrstufiger Fortschritt (Muster 4, Zeigarnik-Effekt)
 * ------------------------------------------------------------------ */
export type Step = {
  key: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'error';
};

export function Stepper({ steps }: { steps: Step[] }) {
  const activeIndex = steps.findIndex((s) => s.status === 'active');
  const activeStep = steps[activeIndex] ?? steps[steps.length - 1];

  return (
    <ol
      role="status"
      aria-live="polite"
      aria-label={`Schritt ${activeIndex + 1} von ${steps.length}: ${activeStep?.label ?? ''}`}
      className="flex flex-col gap-2"
    >
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2 text-sm">
          <StepIcon status={step.status} />
          <span
            className={
              step.status === 'pending' ? 'text-gray-400' : 'text-gray-900'
            }
          >
            Schritt {i + 1} von {steps.length}: {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ status }: { status: Step['status'] }) {
  const reduced = usePrefersReducedMotion();

  if (status === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white text-xs"
      >
        ✓
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-xs"
      >
        !
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-600 ${
          reduced ? '' : 'animate-pulse'
        }`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300"
    />
  );
}

/* ------------------------------------------------------------------ *
 * HintergrundBadge: Hintergrundvorgang mit Benachrichtigung (Muster 5, >10s)
 * ------------------------------------------------------------------ */
export function HintergrundBadge({
  running,
  label = 'Bericht wird erstellt',
  onDone,
  doneLabel = 'Fertig, jetzt ansehen',
}: {
  running: boolean;
  label?: string;
  onDone?: () => void;
  doneLabel?: string;
}) {
  if (!running) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
      <span className="text-sm text-gray-700">{label}</span>
      {onDone && (
        <button
          onClick={onDone}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          {doneLabel}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Fehlerzustand: Muster 7, ersetzt den Ladezustand 1:1 an derselben Stelle
 * ------------------------------------------------------------------ */
export function Fehlerzustand({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center"
    >
      <p className="text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="bg-red-600 text-white hover:bg-red-700">
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * LeererZustand: Muster 8, Laden war erfolgreich aber Ergebnis ist leer
 * ------------------------------------------------------------------ */
export function LeererZustand({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-6 py-10 text-center">
      <p className="text-sm text-gray-600">{message}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
