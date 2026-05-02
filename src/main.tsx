import { useState } from "react";
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

createRoot(document.getElementById("root")!).render(<Root />);
