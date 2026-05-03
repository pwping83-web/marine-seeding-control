import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./app/Dashboard.tsx";
import LoginPage from "./app/LoginPage.tsx";
import "./styles/index.css";
import "leaflet/dist/leaflet.css";

function Root() {
  const [authed, setAuthed] = useState(false);
  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }
  return <Dashboard />;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            background: "#0f172a",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>화면을 그릴 때 오류가 났습니다</h1>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              background: "#020617",
              padding: 16,
              borderRadius: 8,
              overflow: "auto",
            }}
          >
            {this.state.err.message}
            {"\n\n"}
            {this.state.err.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById("root");
if (!el) {
  document.body.innerHTML = "<p style='padding:16px'>#root 요소가 없습니다. index.html 을 확인하세요.</p>";
} else {
  createRoot(el).render(
    <RootErrorBoundary>
      <Root />
    </RootErrorBoundary>,
  );
}
