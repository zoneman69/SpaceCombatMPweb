import "../styles/app.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { colyseus, WS_URL } from "../net";
import TacticalView from "./TacticalView";

type Player = {
  id: string;
  name: string;
  ready: boolean;
};

type LobbyRoom = {
  id: string;
  name: string;
  mode: string;
  host: string;
  players: Player[];
};

const LOCAL_PLAYER_ID = "pilot-1";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [view, setView] = useState<"lobby" | "game">("lobby");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const roomRef = useRef<any>(null);

  useEffect(() => {
    const connect = async () => {
      try {
        setIsBusy(true);
        setStatus(`connecting to ${WS_URL}...`);
        await roomRef.current?.leave?.();
        const room = await colyseus.joinOrCreate("space");
        roomRef.current = room;
        setStatus(`connected ✅ roomId=${room.roomId ?? room.id ?? "unknown"}`);
      } catch (e: any) {
        setStatus(`connect failed ❌ ${e?.message || e}`);
        console.error(e);
      } finally {
        setIsBusy(false);
      }
    };
    void connect();
    return () => roomRef.current?.leave?.();
  }, []);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  );

  const readyCount = activeRoom
    ? activeRoom.players.filter((player) => player.ready).length
    : 0;
  const everyoneReady =
    !!activeRoom && readyCount === activeRoom.players.length;

  useEffect(() => {
    if (!everyoneReady || view !== "lobby") {
      setCountdown(null);
      return;
    }
    setCountdown(10);
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          return prev;
        }
        if (prev <= 1) {
          window.clearInterval(interval);
          setView("game");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [everyoneReady, view]);

  const createRoom = () => {
    const newRoom: LobbyRoom = {
      id: `room-${Date.now()}`,
      name: "Frontier Skirmish",
      mode: "Squad Skirmish",
      host: "Commander Nova",
      players: [{ id: LOCAL_PLAYER_ID, name: "You", ready: false }],
    };
    setRooms((prev) => [newRoom, ...prev]);
    setActiveRoomId(newRoom.id);
  };

  const joinRoom = (roomId: string) => {
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              players: room.players.some((player) => player.id === LOCAL_PLAYER_ID)
                ? room.players
                : [
                    ...room.players,
                    { id: LOCAL_PLAYER_ID, name: "You", ready: false },
                  ],
            }
          : room,
      ),
    );
    setActiveRoomId(roomId);
  };

  const toggleReady = () => {
    if (!activeRoom) {
      return;
    }
    setRooms((prev) =>
      prev.map((room) =>
        room.id === activeRoom.id
          ? {
              ...room,
              players: room.players.map((player) =>
                player.id === LOCAL_PLAYER_ID
                  ? { ...player, ready: !player.ready }
                  : player,
              ),
            }
          : room,
      ),
    );
  };

  if (view === "game") {
    return (
      <div className="game-shell">
        <header className="game-header">
          <div>
            <p className="eyebrow">Mission briefing</p>
            <h1>Engage in the outer rim.</h1>
            <p className="subhead">
              Full tactical view deployed. Your squad has entered the conflict
              zone.
            </p>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => setView("lobby")}
          >
            Return to lobby
          </button>
        </header>
        <section className="game-stage">
          <TacticalView />
        </section>
      </div>
    );
  }

  return (
    <div className="app lobby-page">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">Space Combat MP</p>
          <h1>Fleet operations hub.</h1>
          <p className="subhead">
            Coordinate rooms, ready your squad, and launch into the battle when
            every pilot is locked in.
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
            Room service: <code>space</code> · Tick rate: 20 Hz · Fleet limit: 8
          </p>
        </div>
      </header>

      <main className="lobby-grid lobby-columns">
        <section className="panel lobby-card lobby-rooms">
          <div className="lobby-card-header">
            <div>
              <h2>Active rooms</h2>
              <p className="section-caption">
                Hosts can open a room window; incoming pilots can join any open
                briefings.
              </p>
            </div>
            <button
              className="btn primary"
              type="button"
              onClick={createRoom}
              disabled={isBusy}
            >
              Create new room window
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-state">
              <p>No rooms yet. Spin up a new command window to begin.</p>
            </div>
          ) : (
            <div className="room-grid">
              {rooms.map((room) => (
                <article
                  key={room.id}
                  className={`room-card ${
                    room.id === activeRoomId ? "active" : ""
                  }`}
                >
                  <div>
                    <p className="room-name">{room.name}</p>
                    <p className="room-desc">
                      {room.mode} · Host: {room.host}
                    </p>
                  </div>
                  <div className="room-meta">
                    <span>Players</span>
                    <strong>
                      {room.players.length} / 8
                    </strong>
                  </div>
                  <div className="room-actions">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => joinRoom(room.id)}
                    >
                      Join window
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel lobby-card lobby-roster">
          <h2>Room roster</h2>
          {activeRoom ? (
            <>
              <div className="roster-header">
                <div>
                  <p className="room-name">{activeRoom.name}</p>
                  <p className="room-desc">
                    {activeRoom.mode} · Host: {activeRoom.host}
                  </p>
                </div>
                <div className="ready-status">
                  <span>Ready</span>
                  <strong>
                    {readyCount}/{activeRoom.players.length}
                  </strong>
                </div>
              </div>
              <ul className="roster-list">
                {activeRoom.players.map((player) => (
                  <li key={player.id} className="roster-item">
                    <div>
                      <p>{player.name}</p>
                      <span>{player.ready ? "Ready" : "Standing by"}</span>
                    </div>
                    <span className={`status-pill ${player.ready ? "online" : "offline"}`}>
                      {player.ready ? "Ready" : "Idle"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="ready-actions">
                <button
                  className="btn primary"
                  type="button"
                  onClick={toggleReady}
                  disabled={!activeRoom.players.some((player) => player.id === LOCAL_PLAYER_ID)}
                >
                  {activeRoom.players.find((player) => player.id === LOCAL_PLAYER_ID)?.ready
                    ? "Cancel ready"
                    : "Ready up"}
                </button>
                {everyoneReady && countdown !== null && (
                  <p className="countdown">
                    All pilots ready. Launching in {countdown}s.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>Select a room window to see the roster and ready up.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
