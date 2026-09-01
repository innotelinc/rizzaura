import React from "react";
import { KEY } from "../store";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            background: "#0b0b12",
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <div style={{ fontSize: "3rem" }}>💀</div>
          <h1 style={{ fontSize: "1.3rem" }}>Rizz Aura hit a glitch</h1>
          <p style={{ color: "#9aa0b8", fontSize: ".9rem", maxWidth: "40ch" }}>
            Something crashed the page. A hard refresh usually fixes it — if not, clear this site's
            localStorage.
          </p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(KEY);
              } catch (e) {}
              location.reload();
            }}
            style={{
              fontFamily: "inherit",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              borderRadius: "999px",
              padding: ".8rem 1.6rem",
              background: "linear-gradient(90deg,#00F5FF,#7B2CFF)",
              color: "#0b0b12",
            }}
          >
            ⚡ Reset &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
