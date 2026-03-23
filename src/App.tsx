import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import ProjectDetail from "./components/ProjectDetail";
import SettingsModal from "./components/SettingsModal";
import { Project, CurrentView } from '@/types';

export default function App() {
  const isPresentRoute = window.location.pathname === "/present";
  const [presentHtml, setPresentHtml] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>("dashboard");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    if (!isPresentRoute) return;
    const html = sessionStorage.getItem('openslides_present_html');
    setPresentHtml(html);
  }, [isPresentRoute]);

  // Restore project from URL on mount
  useEffect(() => {
    if (isPresentRoute) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");

    if (projectId) {
      const projects: Project[] = JSON.parse(localStorage.getItem('openslides_projects') || '[]');
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project);
        setCurrentView("project");
      }
    }
  }, []);

  useEffect(() => {
    if (!isPresentRoute || !presentHtml) return;
    document.open();
    document.write(presentHtml);
    document.close();
  }, [isPresentRoute, presentHtml]);

  if (isPresentRoute) {
    return null;
  }

  return (
    <div className="h-screen bg-background text-text-primary font-sans overflow-hidden flex flex-col">
      <Navbar
        goHome={() => {
          setCurrentView("dashboard");
          setSelectedProject(null);
          window.history.pushState({}, "", "/");
        }}
        currentView={currentView}
        projectName={selectedProject?.name}
        projectId={selectedProject?.id}
        onSettingsClick={() => setIsSettingsModalOpen(true)}
        onRename={(newName: string) => {
          if (!selectedProject) return;
          // Update in localStorage
          const projects: Project[] = JSON.parse(localStorage.getItem('openslides_projects') || '[]');
          const updated = projects.map(p => p.id === selectedProject.id ? { ...p, name: newName } : p);
          localStorage.setItem('openslides_projects', JSON.stringify(updated));
          setSelectedProject(prev => prev ? { ...prev, name: newName } : null);
        }}
      />
      <main className="flex-1 overflow-hidden">
        {currentView === "dashboard" && (
          <div className="max-w-5xl mx-auto p-6 h-full overflow-y-auto custom-scrollbar">
            <Dashboard
              onSelectProject={(project: Project) => {
                setSelectedProject(project);
                setCurrentView("project");
                window.history.pushState({}, "", `?project=${project.id}`);
              }}
            />
          </div>
        )}
        {currentView === "project" && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            onBack={() => {
              setSelectedProject(null);
              setCurrentView("dashboard");
              window.history.pushState({}, "", "/");
            }}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}
