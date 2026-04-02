const DIAGNOSTICS_STORAGE_KEY = "walk-up-announcer-diagnostics-v1";
const MAX_DIAGNOSTIC_EVENTS = 400;

function getDiagnosticsStore() {
  if (typeof window === "undefined") {
    return { events: [], sessionId: "", installId: "" };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) || "null");
    return {
      events: Array.isArray(parsed?.events) ? parsed.events : [],
      sessionId: parsed?.sessionId || crypto.randomUUID(),
      installId: parsed?.installId || crypto.randomUUID(),
    };
  } catch {
    return {
      events: [],
      sessionId: crypto.randomUUID(),
      installId: crypto.randomUUID(),
    };
  }
}

function saveDiagnosticsStore(store) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function sanitizeForLog(value, depth = 0) {
  if (depth > 3) {
    return "[max-depth]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeForLog(entry, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, entry]) => [key, sanitizeForLog(entry, depth + 1)]),
    );
  }

  return String(value);
}

export function recordDiagnosticEvent(type, payload = {}) {
  const store = getDiagnosticsStore();
  const nextEvents = [
    ...store.events,
    {
      id: crypto.randomUUID(),
      type,
      ts: new Date().toISOString(),
      perfMs:
        typeof performance !== "undefined" && Number.isFinite(performance.now())
          ? Math.round(performance.now())
          : 0,
      payload: sanitizeForLog(payload),
    },
  ].slice(-MAX_DIAGNOSTIC_EVENTS);

  saveDiagnosticsStore({
    ...store,
    events: nextEvents,
  });
}

export function clearDiagnosticEvents() {
  saveDiagnosticsStore({
    events: [],
    sessionId: crypto.randomUUID(),
    installId: getDiagnosticsStore().installId || crypto.randomUUID(),
  });
}

export function readDiagnosticReport(appState = null) {
  const store = getDiagnosticsStore();

  return {
    exportedAt: new Date().toISOString(),
    sessionId: store.sessionId,
    installId: store.installId,
    location:
      typeof window !== "undefined"
        ? {
            href: window.location.href,
            userAgent: window.navigator?.userAgent || "",
            language: window.navigator?.language || "",
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              pixelRatio: window.devicePixelRatio || 1,
            },
          }
        : null,
    appState: appState
      ? {
          publishedRevision: appState.publishedRevision ?? "",
          playerCount: Array.isArray(appState.players) ? appState.players.length : 0,
          activePlayerNames: Array.isArray(appState.players)
            ? appState.players.map((player) => player.name).slice(0, 20)
            : [],
          settings: appState.settings
            ? {
                volume: appState.settings.volume,
                fadeMs: appState.settings.fadeMs,
              }
            : null,
        }
      : null,
    events: store.events,
  };
}

export function downloadDiagnosticReport(appState = null) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const report = readDiagnosticReport(appState);
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `walk-up-audio-report-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  recordDiagnosticEvent("diagnostics.exported", {
    eventCount: report.events.length,
  });
  return true;
}
