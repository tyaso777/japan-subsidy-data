import { createRoot } from "react-dom/client";
import Home from "./page";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Standalone root element was not found.");
}

createRoot(root).render(<Home />);
