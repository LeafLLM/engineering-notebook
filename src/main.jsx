// Starts React and loads the shared styles. Feature changes usually belong in components/.
import React from "react";
import { createRoot } from "react-dom/client";
import "quill/dist/quill.snow.css";
import "../style.css";
import App from "./App";

createRoot(document.getElementById("root")).render(<App />);
