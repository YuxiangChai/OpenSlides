import React, { useState, useEffect } from "react";
import { Plus, Upload, Folder, Calendar, ArrowRight, Layout, Trash2, CheckCircle, Circle } from "lucide-react";

import { useLanguage } from "../hooks/useLanguage";
import { Project } from "@/types";
import { fetchJson, fetchOk } from "@/lib/http";

interface DashboardProps {
  onSelectProject: (project: Project) => void;
}

export default function Dashboard({ onSelectProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  const fetchProjects = async () => {
    try {
      const data = await fetchJson<Project[]>('/api/projects', undefined, 'Failed to fetch projects');
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    if (projects.some(p => p.name === name)) {
      alert(t('dashboard.duplicateProjectName'));
      return;
    }

    try {
      await fetchOk('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }, 'Failed to create project');
      setNewProjectName("");
      fetchProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleImportHtml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    const html = await file.text();
    // Derive project name from filename (strip .html extension)
    let name = file.name.replace(/\.html?$/i, '').trim();
    if (!name) name = 'Imported Slides';

    // Check for duplicate name and auto-suffix
    let finalName = name;
    let suffix = 1;
    while (projects.some(p => p.name === finalName)) {
      suffix++;
      finalName = `${name} (${suffix})`;
    }

    try {
      // 1. Create the project
      const createdProject = await fetchJson<Project>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: finalName }),
      }, 'Failed to create project');

      // 2. Save the HTML as the initial state
      await fetchOk(`/api/projects/${encodeURIComponent(createdProject.id)}/states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stateId: 'state_1',
          html,
          chat: [],
          context: null,
        }),
      }, 'Failed to import HTML state');

      // 3. Save slide info pointing to this state
      await fetchOk(`/api/projects/${encodeURIComponent(createdProject.id)}/info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          states: [{
            id: 'state_1',
            name: 'Imported',
            path: 'state_1',
            chat_path: 'state_1',
            save_time: new Date().toISOString(),
            is_auto: false,
          }],
          auto_states: [],
          current_state: 'state_1',
        }),
      }, 'Failed to save imported project info');

      fetchProjects();
    } catch (error) {
      console.error('Failed to import project:', error);
    }
  };

  const handleProjectClick = async (project: Project) => {
    if (selectedProjects.size > 0) return;

    // Update last_accessed_at
    try {
      await fetchOk(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_accessed_at: new Date().toISOString() }),
      }, 'Failed to update access time');
    } catch (error) {
      console.error('Failed to update access time:', error);
    }

    onSelectProject(project);
  };

  const toggleSelection = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const deleteSelectedProjects = async () => {
    setShowDeleteConfirm(false);
    const projectIds = Array.from(selectedProjects);

    try {
      await Promise.all(
        projectIds.map((id) => fetchOk(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to delete project'))
      );
      setSelectedProjects(new Set());
      fetchProjects();
    } catch (error) {
      console.error('Failed to delete projects:', error);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-8">
      {/* Hero / Create Section */}
      <section className="bg-gradient-to-br from-gray-800 to-gray-900 p-8 rounded-3xl border border-border shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <Layout size={200} />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-sm shrink-0">
            <h1 className="text-3xl font-bold text-white mb-2">
              {t('dashboard.heroTitle')}
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
              {t('dashboard.heroDescription')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <form
              onSubmit={createProject}
              className="flex items-center gap-3"
            >
              <input
                type="text"
                placeholder={t('dashboard.projectNamePlaceholder')}
                className="w-48 h-12 bg-gray-950/50 border border-gray-700 px-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-gray-500 backdrop-blur-sm"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <button className="h-12 w-36 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap">
                <Plus size={18} />
                {t('dashboard.createProject')}
              </button>
            </form>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={handleImportHtml}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-12 w-36 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl font-medium border border-gray-700 hover:border-gray-600 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Upload size={16} />
              {t('dashboard.importHtml')}
            </button>
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-3 py-2">
            {t('dashboard.recentProjects')}
            <span className="text-xs font-medium text-gray-400 bg-gray-800 px-2 py-1 rounded-full border border-gray-700">
              {projects.length}
            </span>
          </h2>
          {selectedProjects.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors font-medium border border-red-500/20"
            >
              <Trash2 size={18} />
              {t('dashboard.delete')} ({selectedProjects.size})
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-panel rounded-3xl border border-dashed border-gray-700">
            <div className="inline-flex p-4 rounded-full bg-gray-800 mb-4 text-gray-500">
              <Folder size={32} />
            </div>
            <h3 className="text-lg font-medium text-white mb-1">
              {t('dashboard.noProjects')}
            </h3>
            <p className="text-gray-500">
              {t('dashboard.startPrompt')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project)}
                className={`group bg-panel p-6 rounded-2xl border cursor-pointer hover:bg-gray-800/80 transition-all duration-300 relative overflow-hidden ${
                  selectedProjects.has(project.id) ? 'border-blue-500 bg-blue-500/5' : 'border-border hover:border-blue-500/50'
                }`}
              >
                {/* Selection Checkbox */}
                <div
                  className={`absolute top-4 left-4 z-20 transition-opacity duration-200 ${
                    selectedProjects.has(project.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => toggleSelection(e, project.id)}
                >
                  {selectedProjects.has(project.id) ? (
                    <CheckCircle className="text-blue-500 fill-blue-500/20" size={24} />
                  ) : (
                    <Circle className="text-gray-400 hover:text-blue-400" size={24} />
                  )}
                </div>

                <div className="absolute bottom-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                  <ArrowRight className="text-blue-500" />
                </div>

                <div className="flex items-start justify-end mb-6 pl-8">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-background px-2.5 py-1 rounded-lg border border-gray-800">
                    <Calendar size={12} />
                    {new Date(project.last_accessed_at || project.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gray-800 rounded-xl group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors shrink-0">
                    <Folder size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-white truncate ml-1">
                    {project.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-panel border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-white">{t('dashboard.deleteConfirmTitle')}</h3>
              <p className="text-gray-400">
                {t('dashboard.deleteConfirmText')
                  .replace('{count}', String(selectedProjects.size))
                  .replace('{s}', selectedProjects.size > 1 ? 's' : '')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
              >
                {t('dashboard.cancel')}
              </button>
              <button
                onClick={deleteSelectedProjects}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"
              >
                {t('dashboard.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
