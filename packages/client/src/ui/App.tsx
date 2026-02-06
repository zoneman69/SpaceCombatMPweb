import "../styles/app.css";
import { useEffect, useState } from "react";
import { colyseus, WS_URL } from "../net";

export default function App() {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let room: any;

    (async () => {
      try {
        setStatus(`connecting to ${WS_URL}...`);
        room = await colyseus.joinOrCreate("space");
        setStatus(`connected ✅ roomId=${room.id}`);

        // TEMP: log state changes
        room.onStateChange((state: any) => {
          console.log("state", state);
        });
      } catch (e: any) {
        setStatus(`connect failed ❌ ${e?.message || e}`);
        console.error(e);
      }
    })();

    return () => room?.leave?.();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Space Combat MP</h1>
        <p>Multiplayer RTS prototype (orders + authoritative sim).</p>
      </header>

      <main>
        <section className="panel">
          <h2>Status</h2>
          <ul>
            <li>Room: <code>space</code></li>
            <li>Client: <strong>{status}</strong></li>
            <li>Ships per player: 5</li>
            <li>Tick rate: 20 Hz</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Next Steps</h2>
          <ol>
            <li>Connect Colyseus client ✅ (once status shows connected)</li>
            <li>Render units with Three.js</li>
            <li>Drag select + right-click orders</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
