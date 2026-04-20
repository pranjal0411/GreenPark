"use client";

import React, { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MapComponentProps {
  data: any;
}

export default function MapComponent({ data }: MapComponentProps) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    // Delete the default L.Icon._getIconUrl because leaflet messes it up in Next.js
    // We aren't using markers here anyway, just polygons, so it's fine.
  }, []);

  if (!data || !data.geojson) return <div className="p-4 text-center">Loading map data...</div>;

  const { boundary, service_area, underserved } = data.geojson;
  
  // Center on boundary
  const firstCoord = boundary.features[0].geometry.coordinates[0][0];
  const center: [number, number] = [firstCoord[1], firstCoord[0]]; // Leaflet uses [lat, lon]

  return (
    <MapContainer 
      center={center} 
      zoom={11} 
      style={{ height: "100%", width: "100%" }}
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      
      {/* Underserved Area (Red) */}
      <GeoJSON 
        data={underserved} 
        style={{ fillColor: "#ef4444", color: "#ef4444", weight: 1, fillOpacity: 0.4 }} 
      />

      {/* Served Area (Green) */}
      <GeoJSON 
        data={service_area} 
        style={{ fillColor: "#10b981", color: "#10b981", weight: 1, fillOpacity: 0.4 }} 
      />
    </MapContainer>
  );
}
