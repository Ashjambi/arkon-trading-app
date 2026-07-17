import React from 'react';
import { LogEntry } from '../types';

interface LogsPanelProps {
  logs: LogEntry[];
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ logs }) => {
  return (
    <div className="bg-zinc-950/50 p-6 rounded-2xl border border-zinc-900 h-64 overflow-y-auto custom-scrollbar">
      <h3 className="text-zinc-500 font-black text-[10px] uppercase tracking-widest mb-4">نشاط النظام</h3>
      {logs.map((log) => (
        <div key={log.id} className="text-[10px] font-mono mb-2 border-b border-zinc-900/50 pb-1">
          <span className="text-zinc-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
          <span className={`ml-2 ${log.type === 'ERROR' ? 'text-rose-500' : 'text-zinc-300'}`}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
};
