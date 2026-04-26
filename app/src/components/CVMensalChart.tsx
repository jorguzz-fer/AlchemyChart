"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface MonthPoint {
  ym: string;
  cv: number | null;
  n: number;
}

interface MaterialSeries {
  materialId: string;
  materialName: string;
  materialLot: string | null;
  months: MonthPoint[];
}

interface Props {
  level: number;
  materials: MaterialSeries[];
  allMonths: string[]; // eixo X completo (todos os meses do período)
  height?: number;
}

// Paleta de cores para os lotes (ciclo)
const COLOR_PALETTE = [
  "#6d3a8c",  // primary
  "#22c55e",  // green
  "#9155a7",  // light primary
  "#d9ac04",  // gold
  "#ed1566",  // pink
  "#0ea5e9",  // sky
  "#f97316",  // orange
];

function formatYM(ym: string): string {
  const [year, month] = ym.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[Number(month) - 1]} ${year}`;
}

export default function CVMensalChart({ level, materials, allMonths, height = 240 }: Props) {
  // Para cada material, alinha os valores de CV ao eixo X de allMonths
  const series = materials.map((mat, i) => {
    const map = new Map(mat.months.map((m) => [m.ym, m.cv]));
    const data = allMonths.map((ym) => {
      const v = map.get(ym);
      return v !== null && v !== undefined ? Number(v.toFixed(2)) : null;
    });
    return {
      name: `${mat.materialName}${mat.materialLot ? ` (Lote: ${mat.materialLot})` : ""}`,
      data,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
    };
  });

  const allValues = series.flatMap((s) => s.data).filter((v): v is number => v !== null && v > 0);
  const maxCV = allValues.length > 0 ? Math.max(...allValues) : 10;
  const yMax = Math.ceil(maxCV * 1.15);

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      fontFamily: "Raleway, sans-serif",
    },
    title: {
      text: `Nível ${level}`,
      align: "center",
      style: { fontSize: "13px", fontWeight: "600", color: "#5a5a5a" },
    },
    stroke: { curve: "straight", width: 2 },
    markers: { size: 4, strokeColors: "#fff", strokeWidth: 2 },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#eef0f2",
      strokeDashArray: 3,
      padding: { top: 10, right: 20, bottom: 0, left: 10 },
    },
    xaxis: {
      categories: allMonths.map(formatYM),
      labels: {
        style: { colors: "#5a5a5a", fontSize: "10px" },
        rotate: -45,
        rotateAlways: allMonths.length > 12,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      max: yMax,
      labels: {
        style: { colors: "#5a5a5a", fontSize: "11px" },
        formatter: (v) => `${v.toFixed(1)}%`,
      },
    },
    legend: {
      position: "top",
      fontSize: "11px",
      markers: { size: 8 },
    },
    tooltip: {
      theme: "light",
      y: { formatter: (v) => v !== null ? `${v.toFixed(2)}%` : "—" },
    },
  };

  return <ReactApexChart options={options} series={series} type="line" height={height} />;
}
