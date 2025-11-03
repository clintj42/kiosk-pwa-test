import { StrictMode } from "react";
import "./index.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import ReactDOM from "react-dom/client";
import { HomePage } from "./routes/HomePage.tsx";
import { Layout } from "./routes/Layout.tsx";
import { Login } from "./routes/Login.tsx";
import { Protected } from "./routes/Protected.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="login" element={<Login />} />
          <Route path="protected" element={<Protected />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
