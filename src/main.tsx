import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./app/Dashboard.tsx";
import LoginPage from "./app/LoginPage.tsx";
import MobileDeckView from "./app/MobileDeckView.tsx";
import { shouldUseMobileDeckLayout } from "@/lib/mobile-deck-mode";
import {
  SITE_DEPRECATED_PREVIEW_HOST,
  SITE_PRODUCTION_ORIGIN,
} from "@/lib/site-url";
import "./styles/index.css";
import "leaflet/dist/leaflet.css";

/** 예전 미리보기 호스트로 들어온 경우 메인 프로덕션 URL로 이동 */
function DeprecatedHostRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hostname !== SITE_DEPRECATED_PREVIEW_HOST) return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`${SITE_PRODUCTION_ORIGIN}${path === "/" ? "" : path}`);
  }, []);
  return null;
}

function Root() {
  const [authed, setAuthed] = useState(false);
  const [mobileDeck, setMobileDeck] = useState(() => shouldUseMobileDeckLayout());

  useEffect(() => {
    const sync = () => setMobileDeck(shouldUseMobileDeckLayout());
    window.addEventListener("popstate", sync);
    window.addEventListener("resize", sync);
    const mql = window.matchMedia(`(max-width: ${768 - 1}px)`);
    mql.addEventListener("change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("resize", sync);
      mql.removeEventListener("change", sync);
    };
  }, []);

  return (
    <>
      <DeprecatedHostRedirect />
      {!authed ? (
        <LoginPage onSuccess={() => setAuthed(true)} />
      ) : mobileDeck ? (
        <MobileDeckView />
      ) : (
        <Dashboard />
      )}
    </>
  );
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
