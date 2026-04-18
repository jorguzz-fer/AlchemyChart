"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface Props {
  mean: number;
  sd: number;
  values: number[];
  height?: number;
}

/**
 * Levey-Jennings chart — mostra corridas analíticas contra limites ±1s/±2s/±3s.
 * Cores: primary (média), success (±1s), warning (±2s), danger (±3s).
 */
export default function LeveyJenningsChart({ mean, sd, values, height = 320 }: Props) {
  const s1p = mean + sd;
  const s1n = mean - sd;
  const s2p = mean + 2 * sd;
  const s2n = mean - 2 * sd;
  const s3p = mean + 3 * sd;
  const s3n = mean - 3 * sd;

  const categories = values.map((_, i) => i + 1);

  // Mark each point violating 1:3s with danger color
  const markerColors = values.map((v) =>
    v > s3p || v < s3n
      ? "#ed1566"
      : v > s2p || v < s2n
        ? "#d9ac04"
        : "#9155a7",
  );

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      fontFamily: "Raleway, sans-serif",
    },
    stroke: { curve: "straight", width: [3] },
    colors: ["#9155a7"],
    markers: {
      size: 6,
      colors: markerColors,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 8 },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#eef0f2",
      strokeDashArray: 3,
      padding: { top: 10, right: 20, bottom: 0, left: 10 },
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#5a5a5a", fontSize: "11px" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: s3n - sd * 0.3,
      max: s3p + sd * 0.3,
      labels: {
        style: { colors: "#5a5a5a", fontSize: "11px" },
        formatter: (v) => v.toFixed(2),
      },
    },
    annotations: {
      yaxis: [
        { y: s3p, borderColor: "#ed1566", strokeDashArray: 0, label: { text: "+3s", style: { color: "#fff", background: "#ed1566", fontSize: "10px" } } },
        { y: s2p, borderColor: "#d9ac04", strokeDashArray: 4, label: { text: "+2s", style: { color: "#fff", background: "#d9ac04", fontSize: "10px" } } },
        { y: s1p, borderColor: "#00ad2e", strokeDashArray: 4, label: { text: "+1s", style: { color: "#fff", background: "#00ad2e", fontSize: "10px" } } },
        { y: mean, borderColor: "#9155a7", strokeDashArray: 0, label: { text: `Xm = ${mean.toFixed(2)}`, style: { color: "#fff", background: "#9155a7", fontSize: "10px" } } },
        { y: s1n, borderColor: "#00ad2e", strokeDashArray: 4, label: { text: "-1s", style: { color: "#fff", background: "#00ad2e", fontSize: "10px" } } },
        { y: s2n, borderColor: "#d9ac04", strokeDashArray: 4, label: { text: "-2s", style: { color: "#fff", background: "#d9ac04", fontSize: "10px" } } },
        { y: s3n, borderColor: "#ed1566", strokeDashArray: 0, label: { text: "-3s", style: { color: "#fff", background: "#ed1566", fontSize: "10px" } } },
      ],
    },
    tooltip: {
      theme: "light",
      y: { formatter: (v) => v.toFixed(3) },
    },
    legend: { show: false },
  };

  return (
    <ReactApexChart
      options={options}
      series={[{ name: "Valor", data: values }]}
      type="line"
      height={height}
    />
  );
}
