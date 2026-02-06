import "../styles/app.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { colyseus, WS_URL } from "../net";
import TacticalView from "./TacticalView";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [isBusy, setIsBusy] = useState(false);
  const roomRef = useRef<any>(null);

  const connect = useCallback(
    async (mode: "join" | "create") => {
      try {
        setIsBusy(true);
        setStatus(
          mode === "create"
            ? "creating squad room..."
            : `connecting to ${WS_URL}...`,
        );
        await roomRef.current?.leave?.();
        const room =
          mode === "create"
            ? await colyseus.create("space")
            : await colyseus.joinOrCreate("space");
        roomRef.current = room;
        setStatus(`connected ✅ roomId=${room.roomId ?? room.id ?? "unknown"}`);

        // TEMP: log state changes
        room.onStateChange((state: any) => {
          console.log("state", state);
        });
      } catch (e: any) {
        setStatus(`connect failed ❌ ${e?.message || e}`);
        console.error(e);
      } finally {
        setIsBusy(false);
      }
    },
    [setStatus],
  );

  useEffect(() => {
    void connect("join");
    return () => roomRef.current?.leave?.();
  }, [connect]);

  return (
    <div className="app">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">Space Combat MP</p>
          <h1>Command the frontier.</h1>
          <p className="subhead">
            Multiplayer RTS prototype for squad-level orders and authoritative
            simulation. Rally your fleet, secure a sector, and coordinate the
            next deployment.
          </p>
        </div>

        <div className="panel lobby-status">
          <div className="status-row">
            <span className="status-label">Connection</span>
            <span
              className={`status-pill ${
                status.startsWith("connected") ? "online" : "offline"
              }`}
            >
              {status}
            </span>
          </div>
          <p className="status-meta">
            Room: <code>space</code> · Tick rate: 20 Hz · Ships per player: 5
          </p>
        </div>
      </header>

      <main className="lobby-grid">
        <section className="panel lobby-card">
          <h2>Lobby</h2>
          <div className="lobby-room">
            <div>
              <p className="room-name">space</p>
              <p className="room-desc">
                Primary skirmish room. Matchmaking opens as soon as two captains
                connect.
              </p>
            </div>
            <div className="room-stats">
              <div>
                <span>Players</span>
                <strong>1 / 8</strong>
              </div>
              <div>
                <span>Region</span>
                <strong>Auto</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>Skirmish</strong>
              </div>
            </div>
          </div>
          <div className="lobby-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => connect("join")}
              disabled={isBusy}
            >
              Join briefing
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => connect("create")}
              disabled={isBusy}
            >
              Create squad room
            </button>
          </div>
        </section>

        <section className="panel lobby-card">
          <h2>Command briefing</h2>
          <ul className="brief-list">
            <li>Awaiting fleet roster confirmation.</li>
            <li>Calibrate weapon arcs and sensor arrays.</li>
            <li>Sync with squad leaders before deployment.</li>
          </ul>
        </section>

        <section className="panel lobby-card lobby-map">
          <h2>Live tactical map</h2>
          <TacticalView />
        </section>

        <section className="panel lobby-card">
          <h2>Next Steps</h2>
          <ol className="brief-list">
            <li>Connect Colyseus client ✅ (once status shows connected)</li>
            <li>Render units with Three.js ✅</li>
            <li>Drag select + right-click orders ✅</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
