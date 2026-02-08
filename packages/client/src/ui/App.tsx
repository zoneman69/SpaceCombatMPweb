import "../styles/app.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { colyseus, WS_URL } from "../net";
import colyseusPkg from "colyseus.js/package.json";
import { SpaceState } from "@space-combat/shared";
import type { Room } from "colyseus.js";
import type {
  LobbyPlayerSchema,
  LobbyRoomSchema,
} from "@space-combat/shared";
import TacticalView from "./TacticalView";

void SpaceState;

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

export default function App() {
  const [status, setStatus] = useState("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [view, setView] = useState<"lobby" | "game">("lobby");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [hasConnected, setHasConnected] = useState(false);
  const [room, setRoom] = useState<Room<SpaceState> | null>(null);
  const roomRef = useRef<any>(null);
  const lobbyRoomsRef = useRef<SpaceState["lobbyRooms"] | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const boundLobbyRoomPlayersRef = useRef<WeakSet<LobbyRoomSchema>>(
    new WeakSet(),
  );

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    void connect();
    return () => roomRef.current?.leave?.();
  }, []);

  const connect = async () => {
    if (roomRef.current) {
      return roomRef.current;
    }
    try {
      setIsBusy(true);
      setStatus(`connecting to ${WS_URL}...`);
      console.log("[lobby] connecting", {
        ws: WS_URL,
        colyseus: colyseusPkg.version,
      });
      const maxAttempts = 3;
      let room: Room<SpaceState> | null = null;
      let attempt = 0;

      while (!room && attempt < maxAttempts) {
        attempt += 1;
        try {
          room = await colyseus.joinOrCreate<SpaceState>("space");
        } catch (error: any) {
          const message = `${error?.message || error}`;
          const isSeatExpired = message.includes("seat reservation expired");
          if (!isSeatExpired || attempt >= maxAttempts) {
            throw error;
          }
          const waitMs = 500 * attempt;
          console.warn(
            `[lobby] seat reservation expired; retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`,
          );
          setStatus(`reconnecting (attempt ${attempt + 1}/${maxAttempts})...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }

      if (!room) {
        throw new Error("Failed to join or create a room.");
      }
      roomRef.current = room;
      setRoom(room);
      setStatus(`connected ✅ roomId=${room.roomId ?? "unknown"}`);
      setLocalSessionId(room.sessionId ?? null);
      setHasConnected(true);
      if (room.sessionId) {
        room.send("lobby:setName", `Pilot-${room.sessionId.slice(0, 4)}`);
      }

      const applyLobbyRooms = (nextRooms: LobbyRoom[]) => {
        setRooms(nextRooms);
        if (!room.sessionId) {
          return;
        }
        const currentRoom = nextRooms.find((lobby) =>
          lobby.players.some((player) => player.id === room.sessionId),
        );
        if (currentRoom && currentRoom.id !== activeRoomIdRef.current) {
          setActiveRoomId(currentRoom.id);
        }
        if (
          !currentRoom &&
          activeRoomIdRef.current &&
          nextRooms.every((r) => r.id !== activeRoomIdRef.current)
        ) {
          setActiveRoomId(null);
        }
      };

      const syncLobbyRooms = (lobbyRooms: SpaceState["lobbyRooms"]) => {
        const nextRooms = (
          Array.from(lobbyRooms.values()) as LobbyRoomSchema[]
        ).map(
          (roomItem) => ({
            id: roomItem.id,
            name: roomItem.name,
            mode: roomItem.mode,
            host: roomItem.hostName,
            players: (
              Array.from(roomItem.players.values()) as LobbyPlayerSchema[]
            ).map((player) => ({
              id: player.id,
              name: player.name,
              ready: player.ready,
            })),
          }),
        );
        applyLobbyRooms(nextRooms);
      };

      const attachLobbyRoomPlayers = (roomItem: LobbyRoomSchema) => {
        if (boundLobbyRoomPlayersRef.current.has(roomItem)) {
          return;
        }
        boundLobbyRoomPlayersRef.current.add(roomItem);
        roomItem.players.onAdd(() => syncLobbyRooms(lobbyRoomsRef.current!));
        roomItem.players.onRemove(() => syncLobbyRooms(lobbyRoomsRef.current!));
        roomItem.players.onChange(() => syncLobbyRooms(lobbyRoomsRef.current!));
        if (lobbyRoomsRef.current) {
          syncLobbyRooms(lobbyRoomsRef.current);
        }
      };

      const bindLobbyRooms = (lobbyRooms: SpaceState["lobbyRooms"]) => {
        if (lobbyRoomsRef.current === lobbyRooms) {
          return;
        }
        lobbyRoomsRef.current = lobbyRooms;
        syncLobbyRooms(lobbyRooms);
        lobbyRooms.onAdd((roomItem) => {
          attachLobbyRoomPlayers(roomItem);
          syncLobbyRooms(lobbyRooms);
        });
        lobbyRooms.onRemove(() => syncLobbyRooms(lobbyRooms));
        lobbyRooms.onChange(() => syncLobbyRooms(lobbyRooms));
        Array.from(lobbyRooms.values()).forEach((roomItem) =>
          attachLobbyRoomPlayers(roomItem as LobbyRoomSchema),
        );
      };

      if (room.state?.lobbyRooms) {
        bindLobbyRooms(room.state.lobbyRooms);
      }

      room.onMessage("lobby:rooms", (payload) => {
        if (Array.isArray(payload)) {
          applyLobbyRooms(payload as LobbyRoom[]);
        }
      });

      room.onStateChange((state) => {
        if (state?.lobbyRooms) {
          bindLobbyRooms(state.lobbyRooms as SpaceState["lobbyRooms"]);
        }
      });
      return room;
    } catch (e: any) {
      setStatus(`connect failed ❌ ${e?.message || e}`);
      console.error(e);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const ensureConnected = async () => {
    if (roomRef.current) {
      return roomRef.current;
    }
    return connect();
  };

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

  const createRoom = async () => {
    const room = await ensureConnected();
    room?.send("lobby:createRoom", {
      name: "Frontier Skirmish",
      mode: "Squad Skirmish",
    });
  };

  const joinRoom = async (roomId: string) => {
    const room = await ensureConnected();
    room?.send("lobby:joinRoom", { roomId });
  };

  const toggleReady = () => {
    if (!activeRoom) {
      return;
    }
    roomRef.current?.send("lobby:toggleReady");
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
          <TacticalView
            room={room}
            localSessionId={localSessionId}
          />
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
            {!hasConnected && (
              <button
                className="btn"
                type="button"
                onClick={connect}
                disabled={isBusy}
              >
                Connect to lobby
              </button>
            )}
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
                      <p>
                        {player.id === localSessionId ? "You" : player.name}
                      </p>
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
                  disabled={!activeRoom.players.some((player) => player.id === localSessionId)}
                >
                  {activeRoom.players.find((player) => player.id === localSessionId)?.ready
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
