import { StrictMode } from "react";
import "./index.css";
import { BrowserRouter, Route, Routes } from "react-router";
import ReactDOM from "react-dom/client";
import { HomePage } from "./routes/HomePage.tsx";
import { WorkerPage } from "./routes/WorkerPage.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path=":employerWorkerId" element={<WorkerPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
