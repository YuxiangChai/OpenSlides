import React, { useState, useEffect } from "react";
import { Settings, Globe, Pencil, Check, Zap } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { useCDN } from "../hooks/useCDN";
import { CurrentView } from "@/types";
import HelpModal from "./HelpModal";

interface NavbarProps {
  goHome: () => void;
  currentView: CurrentView;
  projectName?: string;
  projectId?: string;
  onSettingsClick: () => void;
  onRename: (newName: string) => void;
}

export default function Navbar({
  goHome,
  currentView,
  projectName,
  projectId,
  onSettingsClick,
  onRename,
}: NavbarProps) {
  const { toggleLanguage, t } = useLanguage();
  const { useChinaCDN, toggleChinaCDN } = useCDN();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(projectName || "");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setEditedName(projectName || "");
  }, [projectName]);

  const handleRename = () => {
    if (!editedName.trim() || editedName === projectName) {
      setIsEditing(false);
      setEditedName(projectName || "");
      return;
    }
    onRename(editedName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditedName(projectName || "");
    }
  };

  return (
    <>
      <nav className="h-16 flex items-center justify-between px-6 border-b border-border bg-background text-gray-200 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 cursor-pointer" onClick={goHome}>
            <span className="font-bold text-xl tracking-tight text-white">
              OpenSlides
            </span>
          </div>

          {currentView === "project" && projectName && (
            <>
              <span className="text-gray-600 text-xl">/</span>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 min-w-[150px]"
                      autoFocus
                      onBlur={handleRename}
                    />
                    <button
                      onClick={handleRename}
                      className="p-1 text-green-400 hover:bg-gray-800 rounded transition-colors"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="font-medium text-lg text-gray-400">
                      {projectName}
                    </span>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 text-gray-500 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-gray-800 rounded transition-all"
                      title={t('common.rename') || 'Rename'}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Center Help Button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/50 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-all group"
          >
            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <span className="text-xs font-bold">?</span>
            </div>
            <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200 w-20 text-center">{t('help.howToUse')}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title={t('settings.language')}
            >
              <Globe size={18} />
            </button>
            <div className="relative group">
              <button
                onClick={toggleChinaCDN}
                className={`p-1.5 rounded-lg transition-colors ${
                  useChinaCDN
                    ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title={useChinaCDN ? t('cdn.enabledTooltip') : t('cdn.disabledTooltip')}
              >
                <Zap size={18} />
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">
                <div className="font-medium text-white mb-1">{t('cdn.title')}</div>
                <div>{useChinaCDN ? t('cdn.enabledInfo') : t('cdn.disabledInfo')}</div>
              </div>
            </div>
            <button
              onClick={onSettingsClick}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title={t('navbar.settings')}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </nav>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
