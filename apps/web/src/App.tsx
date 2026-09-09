import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { refreshScheduleIfStale, startSync } from "@/lib/sync";
import { Dashboard } from "@/views/dashboard";
import { Home } from "@/views/home";
import { ItemForm } from "@/views/item-form";
import { SettingsView } from "@/views/settings";
import { Welcome } from "@/views/welcome";

export function App() {
  useEffect(() => {
    refreshScheduleIfStale();
    return startSync();
  }, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/address" element={<Welcome changeAddress />} />
        <Route path="/items/new" element={<ItemForm />} />
        <Route path="/items/:id" element={<ItemForm />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
