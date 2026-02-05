import "../styles/app.css";

export const App = () => (
  <div className="app">
    <header>
      <h1>Space Combat MP</h1>
      <p>Multiplayer RTS prototype (orders + authoritative sim).</p>
    </header>
    <main>
      <section className="panel">
        <h2>Status</h2>
        <ul>
          <li>Server room: space</li>
          <li>Ships per player: 5</li>
          <li>Tick rate: 20 Hz</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Next Steps</h2>
        <ol>
          <li>Connect Colyseus client</li>
          <li>Render units with Three.js</li>
          <li>Drag select + right-click orders</li>
        </ol>
      </section>
    </main>
  </div>
);
