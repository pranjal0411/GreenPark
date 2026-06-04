"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Layers, MapPin, BarChart3, Activity } from 'lucide-react';

// Avoid SSR for Leaflet and Canvas
const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false });
const ARMapVisualizer = dynamic(() => import('./ARMapVisualizer'), { ssr: false });

export default function Dashboard() {
  const [city, setCity] = useState("New Delhi, India");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [isARMode, setIsARMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeCity = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city_name: city, buffer_dist: 800 })
      });
      if (!res.ok) {
        throw new Error(await res.text() || "Failed to analyze city");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-center glass-panel p-6">
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            GreenPark WebXR
          </h1>
          <p className="text-slate-400 mt-2">Spatial Analysis & AR Visualization</p>
        </div>
        
        <div className="flex gap-4 mt-4 md:mt-0">
          <select 
            className="bg-slate-800 text-white border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="New Delhi, India">New Delhi</option>
            <option value="Chennai, India">Chennai</option>
          </select>
          <button 
            onClick={analyzeCity}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg shadow-emerald-900/20"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Accuracy" 
              value={`${(data.metrics.Accuracy * 100).toFixed(1)}%`} 
              icon={<Activity className="text-emerald-400" />} 
            />
            <MetricCard 
              title="F1 Score" 
              value={data.metrics["F1 Score"].toFixed(2)} 
              icon={<BarChart3 className="text-blue-400" />} 
            />
            <MetricCard 
              title="Served Area" 
              value={`${data.stats.served_area_km2.toFixed(2)} km²`} 
              icon={<MapPin className="text-emerald-400" />} 
            />
            <MetricCard 
              title="Underserved Area" 
              value={`${data.stats.underserved_area_km2.toFixed(2)} km²`} 
              icon={<Layers className="text-red-400" />} 
            />
          </div>

          <div className="flex justify-between items-center mt-8 mb-4">
            <h2 className="text-2xl font-bold">City Spatial Map</h2>
            <button 
              onClick={() => setIsARMode(!isARMode)}
              className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-indigo-900/20 flex items-center gap-2"
            >
              <Layers size={18} />
              {isARMode ? "Return to 2D Map" : "Enter AR/VR Map Mode"}
            </button>
          </div>

          <div className="h-[600px] w-full rounded-xl overflow-hidden glass-panel border border-slate-700/50 relative">
             {isARMode ? (
               <ARMapVisualizer key={data.stats.total_area_km2} data={data} />
             ) : (
               <MapComponent key={data.stats.total_area_km2} data={data} />
             )}
          </div>
        </>
      )}
      
      {!data && !loading && !error && (
        <div className="h-[400px] glass-panel flex items-center justify-center">
          <p className="text-slate-500 text-lg">Select a city and click Analyze to begin.</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="glass-panel p-6 flex flex-col justify-center transform hover:scale-105 transition-transform duration-300 hover:shadow-xl hover:shadow-slate-800/50 cursor-pointer">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <h3 className="text-slate-400 font-medium">{title}</h3>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
