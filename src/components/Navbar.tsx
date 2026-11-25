/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Camera, Image as ImageIcon, FileSpreadsheet, Code2, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  activeTab: 'studio' | 'form' | 'table' | 'script';
  setActiveTab: (tab: 'studio' | 'form' | 'table' | 'script') => void;
  totalAttendeesCount: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  totalAttendeesCount,
  darkMode,
  onToggleDarkMode
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-4 sm:px-6 py-3.5">
        {/* Zone 1: Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-stone-900 text-amber-100 flex items-center justify-center font-bold text-base shadow-sm">
            <Camera className="w-5 h-5 text-amber-200" />
          </div>
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('studio');
            }}
            className="text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0 hover:text-amber-600 transition-colors"
          >
            Absensi Kolase
          </a>
        </div>

        {/* Zone 2: 4 single-line clean nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'studio'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent hover:text-stone-900'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Studio Kolase
          </button>
          <button
            onClick={() => setActiveTab('form')}
            className={`flex items-center gap-2 py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'form'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent hover:text-stone-900'
            }`}
          >
            <Camera className="w-4 h-4" />
            Isi Presensi Peserta
          </button>
          <button
            onClick={() => setActiveTab('table')}
            className={`flex items-center gap-2 py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'table'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent hover:text-stone-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Rekap Sheets ({totalAttendeesCount})
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`flex items-center gap-2 py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'script'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent hover:text-stone-900'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Google Apps Script
          </button>
        </nav>

        {/* Zone 3: Dark Mode Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer"
            title={darkMode ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          >
            {darkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Mode Terang</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-stone-700" />
                <span>Mode Gelap</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav strip */}
      <div className="md:hidden flex items-center justify-around border-t border-stone-100 bg-stone-50/80 px-2 py-2 text-xs font-medium text-stone-600">
        <button
          onClick={() => setActiveTab('studio')}
          className={`px-2 py-1 rounded ${activeTab === 'studio' ? 'bg-stone-200 text-stone-900 font-bold' : ''}`}
        >
          Studio
        </button>
        <button
          onClick={() => setActiveTab('form')}
          className={`px-2 py-1 rounded ${activeTab === 'form' ? 'bg-stone-200 text-stone-900 font-bold' : ''}`}
        >
          Presensi
        </button>
        <button
          onClick={() => setActiveTab('table')}
          className={`px-2 py-1 rounded ${activeTab === 'table' ? 'bg-stone-200 text-stone-900 font-bold' : ''}`}
        >
          Rekap ({totalAttendeesCount})
        </button>
        <button
          onClick={() => setActiveTab('script')}
          className={`px-2 py-1 rounded ${activeTab === 'script' ? 'bg-stone-200 text-stone-900 font-bold' : ''}`}
        >
          Apps Script
        </button>
      </div>
    </header>
  );
};
