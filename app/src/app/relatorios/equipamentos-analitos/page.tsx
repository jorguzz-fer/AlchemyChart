"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipmentId: string;
  equipment: { id: string; name: string };
  material: { id: string; name: string };
}

interface Equipment {
  id: string;
  name: string;
  model: string | null;
  serial: string | null;
}

export default function EquipamentosAnalitosPage() {
  const [analytes, setAnalytes] = useState<Analyte[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analitos").then((r) => r.json()),
      fetch("/api/equipamentos").then((r) => r.json()),
    ]).then(([an, eq]) => {
      if (Array.isArray(an)) setAnalytes(an);
      if (Array.isArray(eq)) setEquipments(eq);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Equipamentos / Analitos</h1>
        <p className="text-gray-500 dark:text-gray-400">Visão completa de equipamentos e seus analitos cadastrados.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 animate-pulse">
              <div className="h-5 w-1/4 bg-gray-100 dark:bg-[#1a1a1a] rounded mb-4" />
              <div className="grid grid-cols-4 gap-2">{[...Array(8)].map((_, j) => <div key={j} className="h-8 bg-gray-100 dark:bg-[#1a1a1a] rounded" />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {equipments.map((eq) => {
            const eqAnalytes = analytes.filter((a) => a.equipmentId === eq.id);
            return (
              <div key={eq.id} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 alchemy-gradient">
                  <span className="material-symbols-outlined text-white text-[20px]">settings_applications</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-white">{eq.name}</h3>
                    {(eq.model || eq.serial) && (
                      <p className="text-white/70 text-xs">
                        {eq.model && `Modelo: ${eq.model}`}{eq.model && eq.serial && " · "}{eq.serial && `Serial: ${eq.serial}`}
                      </p>
                    )}
                  </div>
                  <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full">
                    {eqAnalytes.length} analito(s)
                  </span>
                </div>

                {eqAnalytes.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400">Nenhum analito cadastrado.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-gray-100 dark:bg-[#1a1a1a]">
                    {eqAnalytes.map((a) => (
                      <Link
                        key={a.id}
                        href={`/analitos/painel?id=${a.id}`}
                        className="flex items-center justify-between bg-white dark:bg-[#141414] px-4 py-3 hover:bg-primary-50 dark:hover:bg-[#1a1a1a] transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-medium text-black dark:text-white group-hover:text-primary-600 transition-colors">{a.name}</p>
                          <p className="text-xs text-gray-400">{a.material.name}</p>
                        </div>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-50 group-hover:bg-primary-100 text-primary-600 text-[10px] font-bold shrink-0">
                          {a.level}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
