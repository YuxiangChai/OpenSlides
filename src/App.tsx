import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import ProjectDetail from "./components/ProjectDetail";
import SettingsModal from "./components/SettingsModal";
import { Project, CurrentView } from '@/types';
import { fetchJson } from "@/lib/http";

function buildPresentDocument(html: string): string {
  return html;
}

export default function App() {
  const isPresentRoute = window.location.pathname === "/present";
  const [presentHtml, setPresentHtml] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>("dashboard");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isRestoringProject, setIsRestoringProject] = useState(false);

  useEffect(() => {
    if (!isPresentRoute) return;
    const params = new URLSearchParams(window.location.search);
    const docKey = params.get('docKey') || 'openslides_present_html';
    const html = sessionStorage.getItem(docKey);
    if (!html) return;
    const documentHtml = buildPresentDocument(html);
    setPresentHtml(documentHtml);
  }, [isPresentRoute]);

  const navigateToUrl = async () => {
    if (isPresentRoute) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");

    if (!projectId) {
      setSelectedProject(null);
      setCurrentView("dashboard");
      setIsRestoringProject(false);
      return;
    }

    setIsRestoringProject(true);
    try {
      const projects = await fetchJson<Project[]>('/api/projects', undefined, 'Failed to load projects');
      const project = projects.find((p) => p.id === projectId) || null;

      if (project) {
        setSelectedProject(project);
        setCurrentView("project");
      } else {
        setSelectedProject(null);
        setCurrentView("dashboard");
      }
    } catch (error) {
      console.error('Failed to restore project from URL:', error);
      setSelectedProject(null);
      setCurrentView("dashboard");
    } finally {
      setIsRestoringProject(false);
    }
  };

  // Restore project from URL on mount
  useEffect(() => {
    navigateToUrl();
  }, [isPresentRoute]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => navigateToUrl();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPresentRoute]);

  if (isPresentRoute) {
    return (
      <div className="w-screen h-screen bg-black">
        {presentHtml ? (
          <iframe
            title="Presentation"
            srcDoc={presentHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-popups allow-downloads allow-pointer-lock"
            allow="fullscreen"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-white/70">
            Presentation content is unavailable for this tab.
          </div>
        )}
      </div>
    );
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
        onRename={async (newName: string) => {
          if (!selectedProject) return;
          try {
            const updatedProject = await fetchJson<Project>(`/api/projects/${encodeURIComponent(selectedProject.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName }),
            }, 'Failed to rename project');
            setSelectedProject(updatedProject);
          } catch (error) {
            console.error('Failed to rename project:', error);
          }
        }}
      />
      <main className="flex-1 overflow-hidden">
        {!isRestoringProject && currentView === "dashboard" && (
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
